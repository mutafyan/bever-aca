using D365.Model;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Microsoft.Xrm.Tooling.Connector;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace D365.Utilities
{
    class D365Connector
    {

        CrmServiceClient service;

        public D365Connector(string D365username, string D365password, string D365URL)
        {
            string authType = "OAuth";
            string appId = "51f81489-12ee-4a9e-aaae-a2591f45987d";
            string reDirectURI = "app://58145B91-0C36-4500-8554-080854F2AC97";
            string loginPrompt = "Auto";

            string ConnectionString = string.Format("AuthType = {0};Username = {1};Password = {2}; Url = {3}; AppId={4}; RedirectUri={5};LoginPrompt={6}",
                                                    authType, D365username, D365password, D365URL, appId, reDirectURI, loginPrompt);

            this.service = new CrmServiceClient(ConnectionString);
        }

        public InventoryProduct getInventoryProductByName(string inventoryName, string productName)
        {
            InventoryProduct inventoryProduct = null;
            try
            {
                Inventory inventory = getInventoryByName(inventoryName);
                Product product = getProductByName(productName);
                if(inventory != null && product != null)
                {
                    inventoryProduct = getInventoryProductById(inventory.inventoryId, product.productId); 
                }

            } catch (Exception ex)
            {
                Console.WriteLine("Error while retrieving inventory products by name: "+ ex);
            }
            return inventoryProduct;
        }


        private Product getProductByName(string productName)
        {
            Product productObj = null;
            try
            {
                QueryExpression productIdQuery = new QueryExpression
                {
                    EntityName = "cr4fd_product",
                    ColumnSet = new ColumnSet("cr4fd_productid", "cr4fd_name"),
                    Criteria =
                {
                    FilterOperator = LogicalOperator.And,
                    Conditions =
                    {
                        new ConditionExpression("cr4fd_name", ConditionOperator.Equal, productName),
                    }
                }
                };
                EntityCollection products = service.RetrieveMultiple(productIdQuery);
                if (products.Entities.Count > 0)
                {
                    Entity product = products.Entities[0];
                    productObj = new Product();
                    productObj.productName = product.GetAttributeValue<string>("cr4fd_name");
                    productObj.productId = product.GetAttributeValue<Guid>("cr4fd_productid");
                }
            }
            catch (Exception er)
            {
                Console.WriteLine("Error: " + er); 
            }
            return productObj;
        }
        private Inventory getInventoryByName(string inventoryName)
        {
            Inventory inventoryObj = null;
            try
            {
                QueryExpression inventoryIdQuery = new QueryExpression
                {
                    EntityName = "cr4fd_inventory",
                    ColumnSet = new ColumnSet("cr4fd_inventoryid", "cr4fd_name", "cr4fd_fk_price_list"),
                    Criteria =
                {
                    FilterOperator = LogicalOperator.And,
                    Conditions =
                    {
                        new ConditionExpression("cr4fd_name", ConditionOperator.Equal, inventoryName),
                    }
                }
                };
                EntityCollection inventories = service.RetrieveMultiple(inventoryIdQuery);
                if (inventories.Entities.Count > 0)
                {
                    Entity inventory = inventories.Entities[0];
                    inventoryObj = new Inventory(
                        inventory.GetAttributeValue<Guid>("cr4fd_inventoryid"),
                        inventory.GetAttributeValue<string>("cr4fd_name"),
                        inventory.GetAttributeValue<EntityReference>("cr4fd_fk_price_list").Id
                        );
                }
            }
            catch (Exception er)
            {
                Console.WriteLine("Error: " + er);
            }
            return inventoryObj;
        }
        private InventoryProduct getInventoryProductById(Guid inventoryId, Guid productId)
        {
            InventoryProduct inventoryProductObj = null;
            try
            {
                QueryExpression inventoryProductsQuery = new QueryExpression
                {
                    EntityName = "cr4fd_inventory_product",
                    ColumnSet = new ColumnSet("cr4fd_fk_inventory", "cr4fd_fk_product", "cr4fd_int_quantity"),
                    Criteria = {
                    FilterOperator = LogicalOperator.And,
                    Conditions =
                    {
                        new ConditionExpression("cr4fd_fk_inventory", ConditionOperator.Equal, inventoryId),
                        new ConditionExpression("cr4fd_fk_product", ConditionOperator.Equal, productId),
                    }
                }

                };

                EntityCollection inventoryProducts = service.RetrieveMultiple(inventoryProductsQuery);

                if (inventoryProducts.Entities.Count > 0)
                {
                    Entity inventoryProduct = inventoryProducts.Entities[0];
                    inventoryProductObj = new InventoryProduct(
                        inventoryProduct.GetAttributeValue<Guid>("cr4fd_inventory_productid"),
                        inventoryProduct.GetAttributeValue<EntityReference>("cr4fd_fk_inventory").Id,
                        inventoryProduct.GetAttributeValue<EntityReference>("cr4fd_fk_product").Id,
                        inventoryProduct.GetAttributeValue<int>("cr4fd_int_quantity")
                    ) ;

                }
            }
            catch (Exception er)
            {
                Console.WriteLine("Error: " + er);
            }
            return inventoryProductObj;
        }

        public void updateInventoryProduct(InventoryProduct inventoryProduct, string operationType, int quantity)
        {
            bool type = operationType == "addition" ? true : false;
            updateBasedOnTypeInventoryProduct(inventoryProduct, quantity, type);
        }

        private void updateBasedOnTypeInventoryProduct(InventoryProduct inventoryProduct, int quantity, bool isAddition)
        {
            int newQuantity = isAddition ? inventoryProduct.Quantity + quantity : inventoryProduct.Quantity - quantity;
            if (newQuantity < 0)
            {
                Console.WriteLine($"Not enough quantity to substract, is available {inventoryProduct.Quantity}");
                return;
            }
            // delete the record with 0 quantity
            else if (!isAddition && newQuantity == 0) {
                try
                {
                    service.Delete(inventoryProduct.LogicalName, inventoryProduct.Id);
                    Console.WriteLine("All available quantity substracted, record deleted successfully!");
                    return;
                } catch (Exception ex)
                {
                    Console.WriteLine("Error " + ex);
                }
            };


            InventoryProduct updateInventoryProduct = new InventoryProduct
            {
                Id = inventoryProduct.Id,
                Quantity = newQuantity
            };
            try
            {
                service.Update(updateInventoryProduct);
                string log = isAddition ? "Quantity added successfully" : "Quantity substracted successfully";
                Console.WriteLine(log);
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error occurred while updating entity: " + ex);
            }
            
        }
        public void createInventoryProduct(string inventoryName, string productName, int quantity)
        {
            Inventory inventory = getInventoryByName(inventoryName);
            Product product = getProductByName(productName);
            InventoryProduct newRecord = new InventoryProduct(
                inventory.inventoryId,
                product.productId,
                quantity
                );
            try
            {
                // Create the new record 
                Guid createdRecordId = service.Create(newRecord);
                Console.WriteLine($"Record created with ID: {createdRecordId}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error: {ex.Message}");
            }
        }

    }
}
