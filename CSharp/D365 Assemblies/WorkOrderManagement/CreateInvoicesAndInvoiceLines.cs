using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Workflow;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.Activities;

namespace WorkOrderManagement
{
    public class CreateInvoicesAndInvoiceLines : CodeActivity
    {
        [Input("WorkOrderReference")]
        [ReferenceTarget("cr4fd_work_order")]
        public InArgument<EntityReference> WorkOrderReference { get; set; }

        protected override void Execute(CodeActivityContext executionContext)
        {
            ITracingService tracingService = executionContext.GetExtension<ITracingService>();
            IWorkflowContext context = executionContext.GetExtension<IWorkflowContext>();
            IOrganizationServiceFactory serviceFactory = executionContext.GetExtension<IOrganizationServiceFactory>();
            IOrganizationService service = serviceFactory.CreateOrganizationService(context.UserId);

            EntityReference workOrderRef = WorkOrderReference.Get(executionContext);
            if (workOrderRef == null)
            {
                tracingService.Trace("Work Order reference is null. Exiting workflow.");
                return;
            }

            try
            {
                // Retrieve the Work Order entity
                Entity workOrder = service.Retrieve(workOrderRef.LogicalName, workOrderRef.Id, 
                    new ColumnSet(
                        "cr4fd_name", 
                        "cr4fd_fk_customer",
                        "cr4fd_fk_contact",
                        "cr4fd_fk_price_list", 
                        "transactioncurrencyid", 
                        "cr4fd_mon_total_products_amount", 
                        "cr4fd_mon_total_services_amount",
                        "cr4fd_mlot_description_of_work"));

                // Generate the Invoice
                Entity invoice = GenerateInvoice(service, workOrderRef, workOrder);

                // Generate Invoice Lines for Work Order Products and Services
                GenerateInvoiceLines(service, tracingService, workOrder, invoice);
            }
            catch (Exception ex)
            {
                tracingService.Trace("An error occurred: {0}", ex.Message);
                throw new InvalidPluginExecutionException("An error occurred in GenerateRelatedInvoice workflow activity: " + ex.Message, ex);
            }
        }

        private Entity GenerateInvoice(IOrganizationService service, EntityReference workOrderRef, Entity workOrder)
        {
            decimal totalProductsAmount = workOrder.GetAttributeValue<Money>("cr4fd_mon_total_products_amount")?.Value ?? 0;
            decimal totalServicesAmount = workOrder.GetAttributeValue<Money>("cr4fd_mon_total_services_amount")?.Value ?? 0;
            decimal totalAmount = totalProductsAmount + totalServicesAmount;
            string name = workOrder.GetAttributeValue<string>("cr4fd_name")?.Replace("WO-", "INV-");
            Entity invoice = new Entity("cr4fd_invoice")
            {
                ["cr4fd_name"] = name,
                ["cr4fd_fk_work_order"] = workOrderRef,
                ["cr4fd_fk_customer"] = workOrder.GetAttributeValue<EntityReference>("cr4fd_fk_customer"),
                ["cr4fd_fk_my_contact"] = workOrder.GetAttributeValue<EntityReference>("cr4fd_fk_contact"),
                ["cr4fd_fk_price_list"] = workOrder.GetAttributeValue<EntityReference>("cr4fd_fk_price_list"),
                ["transactioncurrencyid"] = workOrder.GetAttributeValue<EntityReference>("transactioncurrencyid"),
                ["cr4fd_mon_total_amount"] = new Money(totalAmount),
                ["cr4fd_mlot_description_of_work"] = workOrder.GetAttributeValue<string>("cr4fd_mlot_description_of_work"),
            };

            Guid invoiceId = service.Create(invoice);
            invoice.Id = invoiceId;
            return invoice;
        }

        private void GenerateInvoiceLines(IOrganizationService service, ITracingService tracingService, Entity workOrder, Entity invoice)
        {
            // Generate Invoice Lines for Work Order Products
            GenerateInvoiceLinesForEntity(service, tracingService, workOrder, invoice, isProduct: true);

            // Generate Invoice Lines for Work Order Services
            GenerateInvoiceLinesForEntity(service, tracingService, workOrder, invoice, isProduct: false);
        }

        private void GenerateInvoiceLinesForEntity(
            IOrganizationService service,
            ITracingService tracingService,
            Entity workOrder,
            Entity invoice,
            bool isProduct)
        {
            string entityName = "cr4fd_workorderservice";
            string invoiceLineLookupField = "cr4fd_fk_workorderservice";
            if (isProduct)
            {
                entityName = "cr4fd_work_order_product";
                invoiceLineLookupField = "cr4fd_fk_work_order_product";
            }

            // Build query to retrieve related entities (products or services)
            QueryExpression query = new QueryExpression(entityName)
            {
                ColumnSet = new ColumnSet("cr4fd_name", "cr4fd_mon_total_amount")
            };
            query.Criteria.AddCondition("cr4fd_fk_work_order", ConditionOperator.Equal, workOrder.Id);

            EntityCollection entities = service.RetrieveMultiple(query);

            foreach (Entity entity in entities.Entities)
            {
                // invoice line name set to product name (removed autonumbering)
                Entity invoiceLine = new Entity("cr4fd_invoice_line")
                {
                    ["cr4fd_fk_invoice"] = new EntityReference(invoice.LogicalName, invoice.Id),
                    [invoiceLineLookupField] = new EntityReference(entityName, entity.Id),
                    ["cr4fd_mon_total_amount"] = entity.GetAttributeValue<Money>("cr4fd_mon_total_amount"),
                    ["transactioncurrencyid"] = invoice.GetAttributeValue<EntityReference>("transactioncurrencyid"),
                    ["cr4fd_name"] = entity.GetAttributeValue<string>("cr4fd_name")
                };

                Guid invoiceLineId = service.Create(invoiceLine);
                tracingService.Trace("Created Invoice Line ID: {0} for {1} ID: {2}", invoiceLineId, entityName, entity.Id);
            }
        }

    }
}
