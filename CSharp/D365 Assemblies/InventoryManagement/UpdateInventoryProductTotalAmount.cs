using Microsoft.Xrm.Sdk;
using System;

namespace InventoryManagement
{
    // A plugin that recalculates total amount of inventory product record whenever it's quantity changes
    public class UpdateInventoryProductTotalAmount : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            IPluginExecutionContext context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            IOrganizationServiceFactory serviceFactory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            IOrganizationService service = serviceFactory.CreateOrganizationService(context.UserId);
            ITracingService tracingService = (ITracingService)serviceProvider.GetService(typeof(ITracingService));

            // Ensure the Update message
            if (context.MessageName != "Update")
                return;


            if (context.InputParameters.Contains("Target") && context.InputParameters["Target"] is Entity)
            {
                Entity inventoryProduct = (Entity)context.InputParameters["Target"];

                // Check if Quantity has changed
                if (!inventoryProduct.Attributes.Contains("cr4fd_int_quantity") &&
                    !inventoryProduct.Attributes.Contains("cr4fd_mon_price_per_unit"))
                {
                    tracingService.Trace("Nor quantity nor price have changed. Exiting plugin.");
                    return;
                }

                try
                {
                    
                    int quantity = GetQuantity(inventoryProduct, service, tracingService);
                    Money pricePerUnit = GetPricePerUnit(inventoryProduct, service, tracingService);

                    if (pricePerUnit == null || quantity == 0)
                    {
                        return;
                    }

                    decimal totalAmountValue = pricePerUnit.Value * quantity;

                    // Update the Total Amount on the Inventory Product
                    inventoryProduct["cr4fd_mon_total_amount"] = new Money(totalAmountValue);

                    tracingService.Trace($"Total amount recalculated and set to {totalAmountValue}");
                }
                catch (Exception ex)
                {
                    tracingService.Trace("Error occurred: " + ex.Message);
                    throw new InvalidPluginExecutionException($"An error occurred in UpdateInventoryProductTotalAmount plugin: {ex.Message}", ex);
                }
            }
        }

        private Money GetPricePerUnit(Entity inventoryProduct, IOrganizationService service, ITracingService tracingService)
        {
            Money pricePerUnit;
            if (inventoryProduct.Attributes.Contains("cr4fd_mon_price_per_unit"))
            {
                pricePerUnit = inventoryProduct.GetAttributeValue<Money>("cr4fd_mon_price_per_unit");
            }
            else
            {
                Entity existingInventoryProduct = service.Retrieve(
                            "cr4fd_inventory_product",
                            inventoryProduct.Id,
                            new Microsoft.Xrm.Sdk.Query.ColumnSet("cr4fd_mon_price_per_unit"));
                if (existingInventoryProduct == null || !existingInventoryProduct.Contains("cr4fd_mon_price_per_unit"))
                {
                    tracingService.Trace("Price Per Unit not found on Inventory Product");
                    return null;
                }
                pricePerUnit = existingInventoryProduct.GetAttributeValue<Money>("cr4fd_mon_price_per_unit");
            }
            return pricePerUnit;
        }

        private int GetQuantity(Entity inventoryProduct, IOrganizationService service, ITracingService tracingService)
        {
            int quantity;
            if (inventoryProduct.Attributes.Contains("cr4fd_int_quantity"))
            {
                quantity = inventoryProduct.GetAttributeValue<int>("cr4fd_int_quantity");
            }
            else
            {
                Entity existingInventoryProduct = service.Retrieve(
                        "cr4fd_inventory_product",
                        inventoryProduct.Id,
                        new Microsoft.Xrm.Sdk.Query.ColumnSet("cr4fd_int_quantity"));
                if(existingInventoryProduct == null || !existingInventoryProduct.Contains("cr4fd_int_quantity"))
                {
                    tracingService.Trace("Quantity not found or zero on Inventory Product");
                    return 0;
                }

                quantity = existingInventoryProduct.GetAttributeValue<int>("cr4fd_int_quantity");
            }

            return quantity;
        }
    }
}