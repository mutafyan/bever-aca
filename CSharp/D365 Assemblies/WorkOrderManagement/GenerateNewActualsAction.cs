using System;
using System.Activities;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Workflow;
using Microsoft.Xrm.Sdk.Query;

namespace WorkOrderManagement
{
    public class GenerateNewActualsAction : CodeActivity
    {
        [Input("WorkOrder")]
        [ReferenceTarget("cr4fd_work_order")]
        public InArgument<EntityReference> WorkOrder { get; set; }

        [Output("Status")]
        public OutArgument<string> Status { get; set; }

        protected override void Execute(CodeActivityContext context)
        {
            ITracingService tracingService = context.GetExtension<ITracingService>();
            IWorkflowContext workflowContext = context.GetExtension<IWorkflowContext>();
            IOrganizationServiceFactory serviceFactory = context.GetExtension<IOrganizationServiceFactory>();
            IOrganizationService service = serviceFactory.CreateOrganizationService(workflowContext.UserId);

            try
            {
                EntityReference workOrderRef = WorkOrder.Get(context);
                if (workOrderRef == null)
                {
                    throw new InvalidPluginExecutionException("WorkOrder reference is null.");
                }

                tracingService.Trace("Starting GenerateNewActualsAction for Work Order ID: {0}", workOrderRef.Id);

                // Delete existing Actuals related to the Work Order
                DeleteRelatedActuals(service, tracingService, workOrderRef);

                // Create new Actuals based on Work Order Products
                CreateActualsFromWorkOrderProducts(service, tracingService, workOrderRef);

                // Create new Actuals based on Work Order Services
                CreateActualsFromWorkOrderServices(service, tracingService, workOrderRef);

                Status.Set(context, "OK");
                tracingService.Trace("GenerateNewActualsAction completed successfully.");
            }
            catch (Exception ex)
            {
                tracingService.Trace("Exception: {0}", ex.ToString());
                Status.Set(context, $"Error: {ex.Message}");
                throw new InvalidPluginExecutionException($"An error occurred in GenerateNewActualsAction: {ex.Message}", ex);
            }
        }

        private void DeleteRelatedActuals(IOrganizationService service, ITracingService tracingService, EntityReference workOrderRef)
        {
            tracingService.Trace("Deleting related Actuals for Work Order ID: {0}", workOrderRef.Id);

            QueryExpression actualQuery = new QueryExpression("cr4fd_actual")
            {
                ColumnSet = new ColumnSet("cr4fd_actualid"),
                Criteria = new FilterExpression
                {
                    Conditions =
                    {
                        new ConditionExpression("cr4fd_fk_work_order", ConditionOperator.Equal, workOrderRef.Id)
                    }
                }
            };

            EntityCollection actuals = service.RetrieveMultiple(actualQuery);

            foreach (Entity actual in actuals.Entities)
            {
                service.Delete("cr4fd_actual", actual.Id);
            }

            tracingService.Trace("Deleted {0} Actual(s).", actuals.Entities.Count);
        }

        private void CreateActualsFromWorkOrderProducts(IOrganizationService service, ITracingService tracingService, EntityReference workOrderRef)
        {
            tracingService.Trace("Creating Actuals from Work Order Products for Work Order ID: {0}", workOrderRef.Id);

            QueryExpression wopQuery = new QueryExpression("cr4fd_work_order_product")
            {
                ColumnSet = new ColumnSet("cr4fd_fk_product", "cr4fd_int_quantity"),
                Criteria = new FilterExpression
                {
                    Conditions =
                    {
                        new ConditionExpression("cr4fd_fk_work_order", ConditionOperator.Equal, workOrderRef.Id)
                    }
                }
            };

            EntityCollection workOrderProducts = service.RetrieveMultiple(wopQuery);

            foreach (Entity workOrderProduct in workOrderProducts.Entities)
            {
                CreateActualFromWorkOrderProduct(service, tracingService, workOrderProduct, workOrderRef);
            }

            tracingService.Trace("Created Actuals from {0} Work Order Product(s).", workOrderProducts.Entities.Count);
        }

        private void CreateActualFromWorkOrderProduct(IOrganizationService service, ITracingService tracingService, Entity workOrderProduct, EntityReference workOrderRef)
        {
            if (!workOrderProduct.Contains("cr4fd_fk_product"))
            {
                tracingService.Trace("Work Order Product ID {0} does not have a Product lookup.", workOrderProduct.Id);
                return;
            }

            EntityReference productRef = workOrderProduct.GetAttributeValue<EntityReference>("cr4fd_fk_product");

            Entity product = service.Retrieve("cr4fd_product", productRef.Id, new ColumnSet("cr4fd_name", "cr4fd_mon_cost", "transactioncurrencyid"));

            string productName = product.GetAttributeValue<string>("cr4fd_name");
            Money costPerUnit = product.GetAttributeValue<Money>("cr4fd_mon_cost");

            if (costPerUnit == null)
            {
                tracingService.Trace("Product ID {0} does not have a cost per unit.", productRef.Id);
                return;
            }

            int quantity = workOrderProduct.GetAttributeValue<int>("cr4fd_int_quantity");
            decimal totalCostValue = quantity * costPerUnit.Value;
            Money totalSum = new Money(totalCostValue);
            EntityReference currencyRef = product.GetAttributeValue<EntityReference>("transactioncurrencyid");

            CreateActual(service, workOrderRef, productRef, productName, quantity, costPerUnit, totalSum, currencyRef);
        }

        private void CreateActualsFromWorkOrderServices(IOrganizationService service, ITracingService tracingService, EntityReference workOrderRef)
        {
            tracingService.Trace("Creating Actuals from Work Order Services for Work Order ID: {0}", workOrderRef.Id);

            QueryExpression serviceQuery = new QueryExpression("cr4fd_workorderservice")
            {
                ColumnSet = new ColumnSet("cr4fd_fk_service", "cr4fd_int_duration", "cr4fd_fk_resource"),
                Criteria = new FilterExpression
                {
                    Conditions =
                    {
                        new ConditionExpression("cr4fd_fk_work_order", ConditionOperator.Equal, workOrderRef.Id)
                    }
                }
            };

            EntityCollection workOrderServices = service.RetrieveMultiple(serviceQuery);

            foreach (Entity workOrderService in workOrderServices.Entities)
            {
                CreateActualFromWorkOrderService(service, tracingService, workOrderService, workOrderRef);
            }

            tracingService.Trace("Created Actuals from {0} Work Order Service(s).", workOrderServices.Entities.Count);
        }

        private void CreateActualFromWorkOrderService(IOrganizationService service, ITracingService tracingService, Entity workOrderService, EntityReference workOrderRef)
        {
            if (!workOrderService.Contains("cr4fd_fk_service"))
            {
                tracingService.Trace("Work Order Service ID {0} does not have a Service lookup.", workOrderService.Id);
                return;
            }

            EntityReference serviceRef = workOrderService.GetAttributeValue<EntityReference>("cr4fd_fk_service");

            Entity serviceEntity = service.Retrieve("cr4fd_product", serviceRef.Id, new ColumnSet("cr4fd_name"));

            string serviceName = serviceEntity.GetAttributeValue<string>("cr4fd_name");

            // Get duration in minutes and convert to hours
            int durationMinutes = workOrderService.GetAttributeValue<int>("cr4fd_int_duration");
            decimal durationHours = durationMinutes / 60m;

            if (!workOrderService.Contains("cr4fd_fk_resource"))
            {
                tracingService.Trace("Work Order Service ID {0} does not have a Resource lookup.", workOrderService.Id);
                return;
            }

            EntityReference resourceRef = workOrderService.GetAttributeValue<EntityReference>("cr4fd_fk_resource");

            Entity resource = service.Retrieve("cr4fd_resource", resourceRef.Id, new ColumnSet("cr4fd_mon_hourly_rate", "transactioncurrencyid"));

            Money hourlyRate = resource.GetAttributeValue<Money>("cr4fd_mon_hourly_rate");
            EntityReference currencyRef = resource.GetAttributeValue<EntityReference>("transactioncurrencyid");
            
            if (hourlyRate == null)
            {
                tracingService.Trace("Resource ID {0} does not have an hourly rate.", resourceRef.Id);
                return;
            }

            decimal totalCostValue = durationHours * hourlyRate.Value;
            Money totalSum = new Money(totalCostValue);

            CreateActual(
                service,
                workOrderRef, 
                serviceRef, 
                serviceName,
                durationHours, 
                hourlyRate, 
                totalSum, 
                currencyRef
            );
        }

        private void CreateActual(IOrganizationService service, EntityReference workOrderRef, EntityReference productRef, string name, decimal quantityOrDuration, Money cost, Money total, EntityReference currencyRef)
        {
            Entity newActual = new Entity("cr4fd_actual");
            newActual["cr4fd_name"] = name;
            newActual["cr4fd_mon_cost_per_unit"] = cost;
            newActual["cr4fd_dec_quantity"] = quantityOrDuration;
            newActual["cr4fd_mon_total_cost"] = total;
            newActual["cr4fd_fk_work_order"] = workOrderRef;
            newActual["cr4fd_fk_product"] = productRef;
            newActual["transactioncurrencyid"] = currencyRef;

            service.Create(newActual);
        }
    }
}
