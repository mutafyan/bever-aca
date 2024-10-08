using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;

namespace InventoryManagement
{
    /*
     * Recalculate inventory total amount whenever an inventory product is created, updated, or deleted.
     * This plugin handles three message types to prevent code repetition.
     */
    public class UpdateInventoryTotalAmount : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            // Obtain the execution context, organization service, and tracing service
            IPluginExecutionContext context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            IOrganizationServiceFactory serviceFactory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            IOrganizationService service = serviceFactory.CreateOrganizationService(context.UserId);
            ITracingService tracingService = (ITracingService)serviceProvider.GetService(typeof(ITracingService));

            try
            {
                // Get the inventory reference based on the context
                EntityReference inventoryRef = GetInventoryReference(context);
                if (inventoryRef == null)
                {
                    tracingService.Trace("Inventory reference not found. Exiting plugin.");
                    return;
                }

                // Fetch the total amount in base currency
                decimal totalAmountBase = FetchTotalAmountBase(service, inventoryRef);

                // Get the exchange rate
                decimal exchangeRate = GetExchangeRate(service, inventoryRef);

                tracingService.Trace($"Exchange Rate: {exchangeRate}");

                // Calculate the total amount in the inventory's currency
                decimal totalAmount = totalAmountBase * exchangeRate;

                // Update the inventory's total amount
                UpdateInventoryTotalAmountField(service, inventoryRef, totalAmount);

                tracingService.Trace($"Inventory total amount updated successfully, set to {totalAmount:C}.");
            }
            catch (Exception ex)
            {
                throw new InvalidPluginExecutionException($"An error occurred in UpdateInventoryTotalAmount plugin: {ex.Message}");
            }
        }

        private EntityReference GetInventoryReference(IPluginExecutionContext context)
        {
            EntityReference inventoryRef = null;
            string messageName = context.MessageName;

            if (messageName == "Create" || messageName == "Update")
            {
                Entity entity = null;

                if (context.InputParameters.Contains("Target") && context.InputParameters["Target"] is Entity)
                {
                    entity = (Entity)context.InputParameters["Target"];
                }

                if (entity != null && entity.Contains("cr4fd_fk_inventory") && entity["cr4fd_fk_inventory"] != null)
                {
                    inventoryRef = entity.GetAttributeValue<EntityReference>("cr4fd_fk_inventory");
                }
                else if (context.PreEntityImages.Contains("PreImage"))
                {
                    Entity preImage = context.PreEntityImages["PreImage"];
                    if (preImage.Contains("cr4fd_fk_inventory") && preImage["cr4fd_fk_inventory"] != null)
                    {
                        inventoryRef = preImage.GetAttributeValue<EntityReference>("cr4fd_fk_inventory");
                    }
                }
            }
            else if (messageName == "Delete")
            {
                if (context.PreEntityImages.Contains("PreImage"))
                {
                    Entity preImage = context.PreEntityImages["PreImage"];
                    if (preImage.Contains("cr4fd_fk_inventory") && preImage["cr4fd_fk_inventory"] != null)
                    {
                        inventoryRef = preImage.GetAttributeValue<EntityReference>("cr4fd_fk_inventory");
                    }
                }
            }

            return inventoryRef;
        }

        private decimal FetchTotalAmountBase(IOrganizationService service, EntityReference inventoryRef)
        {
            string fetchXml = $@"
                <fetch aggregate='true'>
                    <entity name='cr4fd_inventory_product'>
                        <attribute name='cr4fd_mon_total_amount_base' aggregate='sum' alias='total_amount_base' />
                        <filter>
                            <condition attribute='cr4fd_fk_inventory' operator='eq' value='{inventoryRef.Id}' />
                        </filter>
                    </entity>
                </fetch>";

            FetchExpression fetchExpression = new FetchExpression(fetchXml);
            EntityCollection fetchResult = service.RetrieveMultiple(fetchExpression);

            decimal totalAmountBase = 0m;

            if (fetchResult.Entities.Count > 0)
            {
                Entity resultEntity = fetchResult.Entities[0];
                if (resultEntity.Attributes.Contains("total_amount_base") && resultEntity["total_amount_base"] != null)
                {
                    AliasedValue aliasedValue = (AliasedValue)resultEntity["total_amount_base"];
                    if (aliasedValue.Value is Money money)
                    {
                        totalAmountBase = money.Value;
                    }
                }
            }

            return totalAmountBase;
        }

        private decimal GetExchangeRate(IOrganizationService service, EntityReference inventoryRef)
        {
            // Retrieve the inventory's currency exchange rate
            Entity inventory = service.Retrieve("cr4fd_inventory", inventoryRef.Id, new ColumnSet("transactioncurrencyid"));
            if (inventory == null || !inventory.Contains("transactioncurrencyid"))
                throw new InvalidPluginExecutionException("Inventory currency not found.");

            EntityReference currencyRef = inventory.GetAttributeValue<EntityReference>("transactioncurrencyid");
            Entity currency = service.Retrieve("transactioncurrency", currencyRef.Id, new ColumnSet("exchangerate"));
            if (currency == null || !currency.Contains("exchangerate"))
                throw new InvalidPluginExecutionException("Exchange rate not found for the currency.");

            decimal exchangeRate = currency.GetAttributeValue<decimal>("exchangerate");
            return exchangeRate;
        }

        private void UpdateInventoryTotalAmountField(IOrganizationService service, EntityReference inventoryRef, decimal totalAmount)
        {
            Entity inventoryToUpdate = new Entity("cr4fd_inventory")
            {
                Id = inventoryRef.Id,
                ["cr4fd_mon_total_amount"] = new Money(totalAmount)
            };
            service.Update(inventoryToUpdate);
        }
    }
}
