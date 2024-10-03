using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;

namespace InventoryManagement
{
    /* Recalculate inventory total amount sum whenever an inventory product is created, updated, or deleted
     * The same plugin is used with all three message types 
     * to prevent code repeating, because the logic of recalculation
     * is the same for all cases
    */ 
    public class UpdateInventoryTotalAmount : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            IPluginExecutionContext context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            IOrganizationServiceFactory serviceFactory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            IOrganizationService service = serviceFactory.CreateOrganizationService(context.UserId);

            string messageName = context.MessageName;
            EntityReference inventoryRef = null;

            try
            {
                // Set inventoryRef based on message name
                if (messageName == "Create")
                {
                    if (context.InputParameters.Contains("Target") && context.InputParameters["Target"] is Entity)
                    {
                        Entity inventoryProduct = (Entity)context.InputParameters["Target"];
                        if (inventoryProduct.Contains("cr4fd_fk_inventory") && inventoryProduct["cr4fd_fk_inventory"] != null)
                        {
                            inventoryRef = (EntityReference)inventoryProduct["cr4fd_fk_inventory"];
                        }
                    }
                }
                else if (messageName == "Update")
                {
                    if (context.InputParameters.Contains("Target") && context.InputParameters["Target"] is Entity)
                    {
                        Entity inventoryProduct = (Entity)context.InputParameters["Target"];
                        if (inventoryProduct.Contains("cr4fd_fk_inventory") && inventoryProduct["cr4fd_fk_inventory"] != null)
                        {
                            inventoryRef = (EntityReference)inventoryProduct["cr4fd_fk_inventory"];
                        }
                        else if (context.PreEntityImages.Contains("PreImage"))
                        {
                            Entity preImage = context.PreEntityImages["PreImage"];
                            if (preImage.Contains("cr4fd_fk_inventory") && preImage["cr4fd_fk_inventory"] != null)
                            {
                                inventoryRef = (EntityReference)preImage["cr4fd_fk_inventory"];
                            }
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
                            inventoryRef = (EntityReference)preImage["cr4fd_fk_inventory"];
                        }
                    }
                }

                if (inventoryRef == null)
                {
                    return;
                }

                // Fetch the sum of the total amount in base currency
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

                        Money money = aliasedValue.Value as Money;
                        if (money != null)
                        {
                            totalAmountBase = money.Value;
                        }
                    }
                }

                // Retrieve the Inventory's currency exchange rate
                Entity inventory = service.Retrieve("cr4fd_inventory", inventoryRef.Id, new ColumnSet("transactioncurrencyid"));
                if (inventory == null || !inventory.Contains("transactioncurrencyid"))
                    return;

                EntityReference currencyRef = (EntityReference)inventory["transactioncurrencyid"];
                Entity currency = service.Retrieve("transactioncurrency", currencyRef.Id, new ColumnSet("exchangerate"));
                if (currency == null || !currency.Contains("exchangerate"))
                    return;

                decimal exchangeRate = currency.GetAttributeValue<decimal>("exchangerate");
                decimal totalAmount = totalAmountBase * exchangeRate;
                // Update the Inventory record
                Entity inventoryToUpdate = new Entity("cr4fd_inventory")
                {
                    Id = inventoryRef.Id,
                    ["cr4fd_mon_total_amount"] = new Money(totalAmount)
                };
                service.Update(inventoryToUpdate);
            }
            catch (Exception ex)
            {
                throw new InvalidPluginExecutionException($"An error occurred: {ex.Message}");
            }
        }
    }
}
