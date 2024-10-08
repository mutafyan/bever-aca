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
     * and converts them to inventory's currency using exchange rates.
     */
    public class UpdateInventoryProductPrices : IPlugin
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
                // Validate the plugin execution context
                if (!ValidateContext(context)) return;

                Entity targetEntity = (Entity)context.InputParameters["Target"];

                // Check if the Price List field has changed
                if (!targetEntity.Attributes.Contains("cr4fd_fk_price_list"))
                    return;

                Guid inventoryId = targetEntity.Id;
                EntityReference newPriceListRef = targetEntity.GetAttributeValue<EntityReference>("cr4fd_fk_price_list");
                if (newPriceListRef == null)
                    return;

                
                // Retrieve all Price List Items for the new Price List
                Dictionary<Guid, Money> priceListItems = RetrievePriceListItems(service, newPriceListRef.Id);

                // Retrieve related Inventory Products
                EntityCollection inventoryProducts = RetrieveInventoryProducts(service, inventoryId);


                // Retrieve the Inventory's currency
                EntityReference inventoryCurrencyRef = GetInventoryCurrencyRef(service, inventoryId);
                    
                // Retrieve the new Price List's currency
                EntityReference priceListCurrencyRef = GetPriceListRef(service, newPriceListRef);

                // Retrieve exchange rates
                decimal inventoryCurrencyRate = GetCurrencyExchangeRate(service, inventoryCurrencyRef.Id);
                decimal priceListCurrencyRate = GetCurrencyExchangeRate(service, priceListCurrencyRef.Id);

                // Prepare list of Inventory Products to update
                List<Entity> updatedInventoryProducts = PrepareToUpdateInventoryProducts(
                    inventoryProducts, 
                    priceListItems,
                    inventoryCurrencyRate,
                    priceListCurrencyRate,
                    inventoryCurrencyRef
                );

                // Update Inventory Products
                if (updatedInventoryProducts.Count > 0)
                {
                    tracingService.Trace("Updating inventory products: ", updatedInventoryProducts);
                    ExecuteMultipleUpdate(service, updatedInventoryProducts);
                }
            }
            catch (Exception ex)
            {
                throw new InvalidPluginExecutionException($"An error occurred in UpdateInventoryProductPrices plugin: {ex.Message}");
            }
        }

        private List<Entity> PrepareToUpdateInventoryProducts(EntityCollection inventoryProducts, Dictionary<Guid, Money> priceListItems, decimal inventoryCurrencyRate, decimal priceListCurrencyRate, EntityReference inventoryCurrencyRef)
        {
            List<Entity> updatedInventoryProducts = new List<Entity>();

            foreach (Entity inventoryProduct in inventoryProducts.Entities)
            {
                EntityReference productRef = inventoryProduct.GetAttributeValue<EntityReference>("cr4fd_fk_product");
                if (productRef == null)
                    continue;

                if (!priceListItems.TryGetValue(productRef.Id, out Money pricePerUnit))
                {
                    // Price not found skip this product
                    continue;
                }

                // Convert price to Inventory's currency if needed
                decimal convertedPrice = ConvertPrice(pricePerUnit.Value, priceListCurrencyRate, inventoryCurrencyRate);

                Entity inventoryProductToUpdate = new Entity("cr4fd_inventory_product")
                {
                    Id = inventoryProduct.Id,
                    ["cr4fd_mon_price_per_unit"] = new Money(convertedPrice),
                    ["transactioncurrencyid"] = inventoryCurrencyRef
                };

                updatedInventoryProducts.Add(inventoryProductToUpdate);
            }

            return updatedInventoryProducts;
        }

        private EntityReference GetPriceListRef(IOrganizationService service, EntityReference newPriceListRef)
        {
            Entity newPriceList = service.Retrieve("cr4fd_price_list", newPriceListRef.Id, new ColumnSet("transactioncurrencyid"));
            if (newPriceList == null || !newPriceList.Contains("transactioncurrencyid"))
                return null;
            return newPriceList.GetAttributeValue<EntityReference>("transactioncurrencyid");
        }

        private EntityReference GetInventoryCurrencyRef(IOrganizationService service, Guid inventoryId)
        {
            Entity inventory = service.Retrieve("cr4fd_inventory", inventoryId, new ColumnSet("transactioncurrencyid"));
            if (inventory == null || !inventory.Contains("transactioncurrencyid"))
                return null;
            return inventory.GetAttributeValue<EntityReference>("transactioncurrencyid");

        }

        private bool ValidateContext(IPluginExecutionContext context)
        {
            if (context.MessageName != "Update" || !context.InputParameters.Contains("Target") || !(context.InputParameters["Target"] is Entity))
                return false;
            else return true;
        }

        private Dictionary<Guid, Money> RetrievePriceListItems(IOrganizationService service, Guid priceListId)
        {
            // Retrieve all Price List Items for the given Price List
            // Return a dictionary of Product Id to Price
            QueryExpression query = new QueryExpression("cr4fd_price_list_items")
            {
                ColumnSet = new ColumnSet("cr4fd_fk_product", "cr4fd_mon_price")
            };
            query.Criteria.AddCondition("cr4fd_fk_price_list", ConditionOperator.Equal, priceListId);

            EntityCollection priceListItems = service.RetrieveMultiple(query);

            Dictionary<Guid, Money> priceListItemDict = new Dictionary<Guid, Money>();
            foreach (Entity priceListItem in priceListItems.Entities)
            {
                EntityReference productRef = priceListItem.GetAttributeValue<EntityReference>("cr4fd_fk_product");
                Money price = priceListItem.GetAttributeValue<Money>("cr4fd_mon_price");
                if (productRef != null && price != null)
                {
                    priceListItemDict[productRef.Id] = price;
                }
            }

            return priceListItemDict;
        }

        private EntityCollection RetrieveInventoryProducts(IOrganizationService service, Guid inventoryId)
        {
            // Retrieve all Inventory Products related to the Inventory
            QueryExpression query = new QueryExpression("cr4fd_inventory_product")
            {
                ColumnSet = new ColumnSet("cr4fd_fk_product")
            };
            query.Criteria.AddCondition("cr4fd_fk_inventory", ConditionOperator.Equal, inventoryId);

            EntityCollection inventoryProducts = service.RetrieveMultiple(query);
            return inventoryProducts;
        }

        private decimal GetCurrencyExchangeRate(IOrganizationService service, Guid currencyId)
        {
            Entity currency = service.Retrieve("transactioncurrency", currencyId, new ColumnSet("exchangerate"));
            if (currency != null && currency.Contains("exchangerate"))
                return currency.GetAttributeValue<decimal>("exchangerate");
            else
                throw new Exception("Exchange rate not found for currency: " + currencyId);
        }

        private decimal ConvertPrice(decimal priceValue, decimal sourceCurrencyRate, decimal targetCurrencyRate)
        {
            if (sourceCurrencyRate == targetCurrencyRate)
                return priceValue;

            // Convert price from source currency to base currency
            decimal priceInBaseCurrency = priceValue / sourceCurrencyRate;

            // Convert price from base currency to target currency
            decimal convertedPrice = priceInBaseCurrency * targetCurrencyRate;

            return convertedPrice;
        }

        private void ExecuteMultipleUpdate(IOrganizationService service, List<Entity> entitiesToUpdate)
        {
            // Update entities
            ExecuteMultipleRequest executeMultipleRequest = new ExecuteMultipleRequest()
            {
                Settings = new ExecuteMultipleSettings()
                {
                    ContinueOnError = false,
                    ReturnResponses = false
                },
                Requests = new OrganizationRequestCollection()
            };

            foreach (Entity entityToUpdate in entitiesToUpdate)
            {
                UpdateRequest updateRequest = new UpdateRequest { Target = entityToUpdate };
                executeMultipleRequest.Requests.Add(updateRequest);
            }

            service.Execute(executeMultipleRequest);
        }
    }
}
