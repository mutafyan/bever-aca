using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Microsoft.Xrm.Sdk.Messages;
using System;
using System.Collections.Generic;

namespace InventoryManagement
{
    /* 
     * Update price per unit of each inventory product whenever the price list
     * of selected inventory changes. The plugin retrieves prices from price list items
     * and converts them to inventory's currency using exchange rates
     */
    public class UpdateInventoryProductPrices : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            IPluginExecutionContext context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            IOrganizationServiceFactory serviceFactory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            IOrganizationService service = serviceFactory.CreateOrganizationService(context.UserId);

            if (context.MessageName != "Update" || !context.InputParameters.Contains("Target") || !(context.InputParameters["Target"] is Entity))
                return;

            Entity targetEntity = (Entity)context.InputParameters["Target"];

            if (!targetEntity.Attributes.Contains("cr4fd_fk_price_list"))
                return;

            Guid inventoryId = targetEntity.Id;
            EntityReference newPriceListRef = targetEntity.GetAttributeValue<EntityReference>("cr4fd_fk_price_list");
            if (newPriceListRef == null)
                return;

            // Retrieve the new Price List's currency
            Entity newPriceList = service.Retrieve("cr4fd_price_list", newPriceListRef.Id, new ColumnSet("transactioncurrencyid"));
            if (newPriceList == null || !newPriceList.Contains("transactioncurrencyid"))
                return;
            EntityReference newCurrencyRef = newPriceList.GetAttributeValue<EntityReference>("transactioncurrencyid");

            
            // Retrieve related Inventory Products
            QueryExpression query = new QueryExpression("cr4fd_inventory_product")
            {
                ColumnSet = new ColumnSet("cr4fd_fk_product", "cr4fd_mon_price_per_unit", "transactioncurrencyid", "cr4fd_mon_total_amount", "cr4fd_int_quantity")
            };
            query.Criteria.AddCondition("cr4fd_fk_inventory", ConditionOperator.Equal, inventoryId);

            EntityCollection inventoryProducts = service.RetrieveMultiple(query);
            List<Entity> updatedInventoryProducts = new List<Entity>();

            foreach (Entity inventoryProduct in inventoryProducts.Entities)
            {
                EntityReference productRef = inventoryProduct.GetAttributeValue<EntityReference>("cr4fd_fk_product");
                if (productRef == null)
                    continue;

                // Retrieve Product Price from Price List Items
                QueryExpression priceListItemQuery = new QueryExpression("cr4fd_price_list_items")
                {
                    ColumnSet = new ColumnSet("cr4fd_mon_price", "transactioncurrencyid")
                };
                priceListItemQuery.Criteria.AddCondition("cr4fd_fk_price_list", ConditionOperator.Equal, newPriceListRef.Id);
                priceListItemQuery.Criteria.AddCondition("cr4fd_fk_product", ConditionOperator.Equal, productRef.Id);

                EntityCollection priceListItems = service.RetrieveMultiple(priceListItemQuery);
                if (priceListItems.Entities.Count == 0)
                    continue;

                Entity priceListItem = priceListItems.Entities[0];
                Money pricePerUnit = priceListItem.GetAttributeValue<Money>("cr4fd_mon_price");
                if (pricePerUnit == null)
                    continue;

                EntityReference productCurrencyRef = priceListItem.GetAttributeValue<EntityReference>("transactioncurrencyid");
                if (productCurrencyRef == null)
                    continue;

                // Convert price to Inventory's currency if needed
                decimal convertedPrice = ConvertPrice(service, pricePerUnit.Value, productCurrencyRef.Id, newCurrencyRef.Id);

                int quantity = inventoryProduct.Contains("cr4fd_int_quantity") ? inventoryProduct.GetAttributeValue<int>("cr4fd_int_quantity") : 0;
                decimal totalAmountValue = convertedPrice * quantity;

                // Update Inventory Product
                Entity inventoryProductToUpdate = new Entity("cr4fd_inventory_product")
                {
                    Id = inventoryProduct.Id,
                    ["transactioncurrencyid"] = newCurrencyRef,
                    ["cr4fd_mon_price_per_unit"] = new Money(convertedPrice),
                    ["cr4fd_mon_total_amount"] = new Money(totalAmountValue)
                };

                updatedInventoryProducts.Add(inventoryProductToUpdate);
            }

            if (updatedInventoryProducts.Count > 0)
            {
                ExecuteMultipleRequest executeMultipleRequest = new ExecuteMultipleRequest()
                {
                    Settings = new ExecuteMultipleSettings()
                    {
                        ContinueOnError = false,
                        ReturnResponses = false
                    },
                    Requests = new OrganizationRequestCollection()
                };

                foreach (Entity inventoryProductToUpdate in updatedInventoryProducts)
                {
                    UpdateRequest updateRequest = new UpdateRequest { Target = inventoryProductToUpdate };
                    executeMultipleRequest.Requests.Add(updateRequest);
                }

                service.Execute(executeMultipleRequest);
            }
        }

        private decimal ConvertPrice(IOrganizationService service, decimal priceValue, Guid sourceCurrencyId, Guid targetCurrencyId)
        {
            if (sourceCurrencyId == targetCurrencyId)
                return priceValue;

            decimal sourceCurrencyRate = GetCurrencyExchangeRate(service, sourceCurrencyId);
            decimal targetCurrencyRate = GetCurrencyExchangeRate(service, targetCurrencyId);

            decimal priceInBaseCurrency = priceValue / sourceCurrencyRate;
            decimal convertedPrice = priceInBaseCurrency * targetCurrencyRate;

            return convertedPrice;
        }

        private decimal GetCurrencyExchangeRate(IOrganizationService service, Guid currencyId)
        {
            Entity currency = service.Retrieve("transactioncurrency", currencyId, new ColumnSet("exchangerate"));
            if (currency != null && currency.Contains("exchangerate"))
                return currency.GetAttributeValue<decimal>("exchangerate");
            else
                throw new Exception("Exchange rate not found for currency: " + currencyId);
        }
    }
}
