using D365.Model;
using D365.Utilities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace D365
{
    class Program
    {
        static void Main(string[] args)
        {
            string inventoryName, productName, operationType;
            int quantity;
            try
            {
                D365Connector d365Connector = new D365Connector(
                    "LOGIN", 
                    "PASSWORD", 
                    "URL"
                );
                Console.WriteLine("Successfully connected to D365");

                Dictionary<string, object> inputs = getAndValidateInputs();
                if(inputs == null)
                {
                    Console.WriteLine("Something wrong with inputs!");
                    Console.ReadKey();
                    return;
                }
                inventoryName = (string)inputs["inventoryName"];
                productName = (string)inputs["productName"];
                operationType = (string)inputs["operationType"];
                quantity = (int)inputs["quantity"];
                Console.WriteLine(
                    $"Trying {operationType} on inventory \"{inventoryName}\" with product \"{productName}\" with quantity - {quantity}..."
                    );

                InventoryProduct inventoryProduct = d365Connector.getInventoryProductByName(inventoryName, productName);

                if(inventoryProduct == null)
                {
                    Console.WriteLine("No matching inventory found!");
                    if(operationType == "addition")
                    {
                        d365Connector.createInventoryProduct(inventoryName, productName, quantity);
                    }
                } else
                {
                    d365Connector.updateInventoryProduct(inventoryProduct, operationType, quantity);
                }
            
                
            } 
            catch (Exception ex)
            {
                Console.WriteLine("Error occured! " + ex);
            }
            Console.WriteLine("Press any key to continue...");
            Console.ReadKey();
        }

        private static Dictionary<string, object> getAndValidateInputs()
        {

            Dictionary<string, object> dict = new Dictionary<string, object>();
            try
            {
                Console.WriteLine("Please Enter Inventory Name: ");
                dict.Add("inventoryName",Console.ReadLine());
                Console.WriteLine("Please Enter Product Name: ");
                dict.Add("productName", Console.ReadLine());
                if((string)dict["inventoryName"] == null || (string)dict["productName"] == null)
                {
                    return null;
                }
                Console.WriteLine("Please Enter Quantity: ");
                if (!int.TryParse(Console.ReadLine(), out int quantity))
                {
                    Console.WriteLine("Enter a valid number for quantity!");
                    return null;
                }
                dict.Add("quantity", quantity);

                Console.WriteLine("Please Enter Type of operation (Addition [0] / substraction [1]):");
                string type = Console.ReadLine()?.ToLower();

                if (type == "0") type = "addition";
                else if (type == "1") type = "substraction";

                if(type != "addition" && type != "substraction")
                {
                    Console.WriteLine("Not a valid operation type!");
                    return null;
                }
                dict.Add("operationType", type);
           
            } catch(Exception ex)
            {
                Console.WriteLine("ERROR: " + ex);
           
            }
            return dict;

        }
    }


}
