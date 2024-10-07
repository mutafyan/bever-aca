using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;

namespace WorkOrderManagement
{
    public class UpdateQuantityOnWorkOrderStateChange : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            IPluginExecutionContext context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            IOrganizationServiceFactory serviceFactory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            IOrganizationService service = serviceFactory.CreateOrganizationService(context.UserId);
            ITracingService tracingService = (ITracingService)serviceProvider.GetService(typeof(ITracingService));

            // Define the status value for "close-posted"
            int closePostedStatusValue = 903020000;

            if (!IsValidContext(context)) return;


            if (!TargetEntityContainsStatus(context, out Entity targetEntity)) return;
          

            try
            {
                OptionSetValue status = targetEntity.GetAttributeValue<OptionSetValue>("cr4fd_os_status");

                if (!IsClosePostedStatus(status, closePostedStatusValue)) return;

                tracingService.Trace("Status is set to close-posted. Proceeding with inventory update.");

                EntityCollection workOrderProducts = RetrieveWorkOrderProducts(service, targetEntity.Id);

                if (workOrderProducts.Entities.Count == 0)
                {
                    tracingService.Trace("No work order products found. Exiting plugin.");
                    return;
                }

                UpdateInventoryQuantities(service, tracingService, workOrderProducts);

                tracingService.Trace("All Inventory quantities updated successfully.");
            }
            catch (Exception ex)
            {
                tracingService.Trace($"An error occurred: {ex.Message}");
                throw new InvalidPluginExecutionException($"An error occurred in UpdateQuantityOnWorkOrderStateChange plugin: {ex.Message}", ex);
            }
        }

        private bool IsValidContext(IPluginExecutionContext context)
        {
            return context.MessageName == "Update" &&
                   context.PrimaryEntityName == "cr4fd_work_order" &&
                   context.InputParameters.Contains("Target") &&
                   context.InputParameters["Target"] is Entity;
        }

        private bool TargetEntityContainsStatus(IPluginExecutionContext context, out Entity targetEntity)
        {
            targetEntity = (Entity)context.InputParameters["Target"];
            return targetEntity.Contains("cr4fd_os_status");
        }

        private bool IsClosePostedStatus(OptionSetValue status, int closePostedStatusValue)
        {
            return status != null && status.Value == closePostedStatusValue;
        }

        private EntityCollection RetrieveWorkOrderProducts(IOrganizationService service, Guid workOrderId)
        {
            QueryExpression workOrderProductQuery = new QueryExpression("cr4fd_work_order_product")
            {
                ColumnSet = new ColumnSet("cr4fd_fk_inventory", "cr4fd_fk_product", "cr4fd_int_quantity"),
                Criteria = new FilterExpression
                {
                    Conditions =
                    {
                        new ConditionExpression("cr4fd_fk_work_order", ConditionOperator.Equal, workOrderId)
                    }
                }
            };

            return service.RetrieveMultiple(workOrderProductQuery);
        }

        private void UpdateInventoryQuantities(IOrganizationService service, ITracingService tracingService, EntityCollection workOrderProducts)
        {
            foreach (Entity workOrderProduct in workOrderProducts.Entities)
            {
                EntityReference inventoryRef = workOrderProduct.GetAttributeValue<EntityReference>("cr4fd_fk_inventory");
                EntityReference productRef = workOrderProduct.GetAttributeValue<EntityReference>("cr4fd_fk_product");
                int orderedQuantity = workOrderProduct.GetAttributeValue<int>("cr4fd_int_quantity");

                if (inventoryRef == null || productRef == null)
                {
                    tracingService.Trace("Work Order Product is missing Inventory or Product reference. Skipping this record.");
                    continue;
                }


                Entity inventoryProduct = RetrieveInventoryProduct(service, inventoryRef.Id, productRef.Id);
                int currentAvailableQuantity = inventoryProduct.GetAttributeValue<int>("cr4fd_int_quantity");
                int newAvailableQuantity = currentAvailableQuantity - orderedQuantity;


                if (newAvailableQuantity < 0)
                {
                    throw new InvalidPluginExecutionException($"Not enough quantity of selected product in selected inventory. Current available: {currentAvailableQuantity}, Ordered: {orderedQuantity}.");
                }

                UpdateInventoryProduct(service, inventoryProduct.Id, newAvailableQuantity);

            }
        }

        private Entity RetrieveInventoryProduct(IOrganizationService service, Guid inventoryId, Guid productId)
        {
            QueryExpression inventoryProductQuery = new QueryExpression("cr4fd_inventory_product")
            {
                ColumnSet = new ColumnSet("cr4fd_inventory_productid", "cr4fd_int_quantity"),
                Criteria = new FilterExpression
                {
                    Conditions =
                    {
                        new ConditionExpression("cr4fd_fk_inventory", ConditionOperator.Equal, inventoryId),
                        new ConditionExpression("cr4fd_fk_product", ConditionOperator.Equal, productId)
                    }
                }
            };

            EntityCollection inventoryProducts = service.RetrieveMultiple(inventoryProductQuery);

            if (inventoryProducts.Entities.Count == 0)
            {
                throw new InvalidPluginExecutionException("There is no Product registered in selected Inventory.");
            }

            return inventoryProducts.Entities[0];
        }

        private void UpdateInventoryProduct(IOrganizationService service, Guid inventoryProductId, int newAvailableQuantity)
        {
            Entity updateInventoryProduct = new Entity("cr4fd_inventory_product")
            {
                Id = inventoryProductId
            };
            updateInventoryProduct["cr4fd_int_quantity"] = newAvailableQuantity;

            service.Update(updateInventoryProduct);
        }
    }
}