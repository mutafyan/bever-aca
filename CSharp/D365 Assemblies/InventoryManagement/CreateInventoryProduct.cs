using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;

namespace InventoryManagement
{
    // A plugin that fills automated fields when creating inventory product and also calculates total amount field
    public class CreateInventoryProduct : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            IPluginExecutionContext context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            IOrganizationServiceFactory serviceFactory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            IOrganizationService service = serviceFactory.CreateOrganizationService(context.UserId);

            if (context.InputParameters.Contains("Target") && context.InputParameters["Target"] is Entity)
            {
                Entity inventoryProduct = (Entity)context.InputParameters["Target"];

                    if (!inventoryProduct.Contains("cr4fd_fk_inventory") || !inventoryProduct.Contains("cr4fd_fk_product"))
                        return; // Exit if no inventory or product is linked.

                    EntityReference inventoryRef = inventoryProduct.GetAttributeValue<EntityReference>("cr4fd_fk_inventory");
                    EntityReference productRef = inventoryProduct.GetAttributeValue<EntityReference>("cr4fd_fk_product");

                try
                {
                    int quantity = GetQuantity(inventoryProduct);
                    if (quantity == 0)
                        return; // Exit if quantity is zero or not specified.

                    // Set inventoryProduct name to product's name
                    string productName = GetProductName(service, productRef);
                    if (productName == null)
                        return;
                    inventoryProduct["cr4fd_name"] = productName;
                    
                    // get the associated currency of inventory
                    EntityReference inventoryCurrencyRef = GetCurrencyOfInventory(service, inventoryRef);
                    if (inventoryCurrencyRef == null)
                        return; 
                    inventoryProduct["transactioncurrencyid"] = inventoryCurrencyRef;

                    // Get price per unit from Product
                    Money productPrice = GetProductPrice(service, productRef);
                    if (productPrice == null)
                        return; 

                    // Get the currency of the Product
                    EntityReference productCurrencyRef = GetCurrencyOfProduct(service, productRef);
                    if (productCurrencyRef == null)
                        return; 

                    // Convert product price to Inventory's currency using exchange rate
                    decimal convertedPrice = ConvertPriceToInventoryCurrency(service, productPrice.Value, productCurrencyRef.Id, inventoryCurrencyRef.Id);

                    // Set the converted Price Per Unit on the Inventory Product
                    inventoryProduct["cr4fd_mon_price_per_unit"] = new Money(convertedPrice);


                    // Set the Total Amount on the Inventory Product
                    decimal totalAmountValue = convertedPrice * quantity;
                    inventoryProduct["cr4fd_mon_total_amount"] = new Money(totalAmountValue);
                }
                catch (Exception ex)
                {
                    throw new InvalidPluginExecutionException($"An error occurred while calculating inventory product sum: {ex.Message}");
                }

            }
        }
        private string GetProductName(IOrganizationService service, EntityReference productRef)
        {
            Entity product = service.Retrieve("cr4fd_product", productRef.Id, new ColumnSet("cr4fd_name"));
            if (product != null && product.Contains("cr4fd_name"))
                return product.GetAttributeValue<string>("cr4fd_name");
            else
                return null;
        }

        private EntityReference GetCurrencyOfInventory(IOrganizationService service, EntityReference inventoryRef)
        {
            Entity inventory = service.Retrieve("cr4fd_inventory", inventoryRef.Id, new ColumnSet("transactioncurrencyid"));
            if (inventory != null && inventory.Contains("transactioncurrencyid"))
                return inventory.GetAttributeValue<EntityReference>("transactioncurrencyid");
            else
                return null;
        }

        private EntityReference GetCurrencyOfProduct(IOrganizationService service, EntityReference productRef)
        {
            Entity product = service.Retrieve("cr4fd_product", productRef.Id, new ColumnSet("transactioncurrencyid"));
            if (product != null && product.Contains("transactioncurrencyid"))
                return product.GetAttributeValue<EntityReference>("transactioncurrencyid");
            else
                return null;
        }

        private int GetQuantity(Entity inventoryProduct)
        {
            if (inventoryProduct.Contains("cr4fd_int_quantity") && inventoryProduct["cr4fd_int_quantity"] != null)
                return inventoryProduct.GetAttributeValue<int>("cr4fd_int_quantity");
            else
                return 0;
        }

        private Money GetProductPrice(IOrganizationService service, EntityReference productRef)
        {
            Entity product = service.Retrieve("cr4fd_product", productRef.Id, new ColumnSet("cr4fd_mon_unit_price"));
            if (product != null && product.Contains("cr4fd_mon_unit_price"))
                return product.GetAttributeValue<Money>("cr4fd_mon_unit_price");
            else
                return null;
        }

        private decimal ConvertPriceToInventoryCurrency(IOrganizationService service, decimal productPriceValue, Guid productCurrencyId, Guid inventoryCurrencyId)
        {
            // If the currencies are the same, no conversion needed
            if (productCurrencyId == inventoryCurrencyId)
                return productPriceValue;

            decimal productCurrencyRate = GetCurrencyExchangeRate(service, productCurrencyId);
            decimal inventoryCurrencyRate = GetCurrencyExchangeRate(service, inventoryCurrencyId);

            // Convert the product price to base currency
            decimal priceInBaseCurrency = productPriceValue / productCurrencyRate;

            // Convert from base currency to inventory currency
            decimal convertedPrice = priceInBaseCurrency * inventoryCurrencyRate;

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
