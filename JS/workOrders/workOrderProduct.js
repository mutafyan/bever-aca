/**
 *  Calculate total of work order products
 */ 
function calculateWorkOrderProductsAmount(executionContext) {
    const formContext = executionContext.getFormContext();
    const amountField = formContext.getAttribute("cr4fd_mon_total_amount");
    const pricePerUnit = formContext.getAttribute("cr4fd_mon_price_per_unit")?.getValue();
    const quantity = formContext.getAttribute("cr4fd_int_quantity")?.getValue();

    if(pricePerUnit && quantity && amountField) {
        amountField.setValue(pricePerUnit * quantity);
    }
}

/**
 * Set a lookup filter on product lookup field
 * Which lets only products of type product from selected inventory be displayed
 */
let filterPointerProduct = null;
function productLookupFilter(executionContext) {
    const formContext = executionContext.getFormContext();
    const inventory = formContext.getAttribute("cr4fd_fk_inventory")?.getValue();
    if (filterPointer) {
        formContext.getControl("cr4fd_fk_product").removePreSearch(filterPointer);
    }

    if (inventory && inventory.length > 0) {
        // Set the filter function to apply the lookup filter
        filterPointer = applyProductFilter.bind(null, formContext, inventory[0].id);
        formContext.getControl("cr4fd_fk_product").addPreSearch(filterPointer);
    }

}

function applyProductFilter (formContext, inventoryId) {
    
    const fetchXml = `
    <fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="true">
        <entity name="cr4fd_product">
            <attribute name="cr4fd_productid"/>
            <attribute name="cr4fd_name"/>
            <attribute name="cr4fd_mon_unit_price"/>
            <order attribute="cr4fd_name" descending="false"/>
                <filter type="and">
                    <condition attribute="cr4fd_os_type" operator="eq" value="903020000"/> <!-- Select only type product  -->
                </filter>
            <link-entity name="cr4fd_inventory_product" from="cr4fd_fk_product" to="cr4fd_productid" link-type="inner" alias="ac">
                <filter type="and">
                    <condition attribute="cr4fd_fk_inventory" operator="eq" uitype="cr4fd_inventory" value="${inventoryId}"/>
                </filter>
            </link-entity>
        </entity>   
    </fetch>`;

    const layoutXml = `
    <grid name="resultset" object="2" jump="cr4fd_productid" select="1" icon="1" preview="1">
        <row name="result" id="cr4fd_productid">
            <cell name="cr4fd_name" width="300" /> 
            <cell name="cr4fd_name" width="300" /> 
        </row>
    </grid>`;


    const viewId = "{00000000-0000-0000-0000-000000000002}";
    const entityName = "cr4fd_product";
    const viewDisplayName = "Filtered Products";
    formContext.getControl("cr4fd_fk_product").addCustomView(
        viewId,
        entityName,
        viewDisplayName,
        fetchXml,
        layoutXml,
        true
    );
    
}


/**
 * AutoFills price per unit and cost from selected product
 */
async function autofillPricePerUnitAndCost(executionContext) {
    const formContext = executionContext.getFormContext();

    const productLookup = formContext.getAttribute("cr4fd_fk_product")?.getValue();
    if (!productLookup) return;

    const productId = productLookup[0].id.replace("{", "").replace("}","").toLowerCase();

    const product = await Xrm.WebApi.retrieveRecord("cr4fd_product", productId, "?$select=cr4fd_mon_unit_price,_transactioncurrencyid_value,cr4fd_mon_cost");
    if (!product) return;

    const pricePerUnit = product.cr4fd_mon_unit_price;
    const productCurrencyId = product._transactioncurrencyid_value;
    const productCost = product.cr4fd_mon_cost;

    if (productCurrencyId && pricePerUnit) {
        formContext.getAttribute("transactioncurrencyid").setValue([{
            id: productCurrencyId,
            name: product["_transactioncurrencyid_value@OData.Community.Display.V1.FormattedValue"],
            entityType: "transactioncurrency"
        }]);
        formContext.getAttribute("cr4fd_mon_price_per_unit").setValue(pricePerUnit);

    }
    if(productCost) {
        formContext.getAttribute("cr4fd_mon_cost").setValue(productCost);
    }
}


/**
 * Autofill Inventory lookup field with one where selected product has the most quantity
 * in work order product
*/
async function autofillInventoryWithMaxQuantity(executionContext) {
    const formContext = executionContext.getFormContext();
    const productLookup = formContext.getAttribute("cr4fd_fk_product").getValue();
    const inventoryField = formContext.getAttribute("cr4fd_fk_inventory");

    if (!productLookup || inventoryField.getValue()) {
        // If no product is selected or Inventory is not blank, do nothing
        return;
    }

    const productId = productLookup[0].id.replace(/[{}]/g, "").toLowerCase();

    const fetchXml = `
    <fetch aggregate="true">
      <entity name="cr4fd_inventory_product"> 
        <attribute name="cr4fd_int_quantity" alias="max_quantity" aggregate="max" />
        <attribute name="cr4fd_fk_inventory" alias="inventory_id" groupby="true" />
        <filter>
          <condition attribute="cr4fd_fk_product" operator="eq" value="${productId}" />
        </filter>
      </entity>
    </fetch>`;

    
    const result = await Xrm.WebApi.retrieveMultipleRecords("cr4fd_inventory_product", `?fetchXml=${encodeURIComponent(fetchXml)}`);
    if (result.entities.length > 0) {
        let maxInventory = null;
        let maxQuantity = -1

        // Iterate through results to find the inventory with the maximum quantity
        result.entities.forEach(entity => {
            const quantity = parseFloat(entity["max_quantity"]);
            if (quantity > maxQuantity) {
                maxQuantity = quantity;
                maxInventory = { 
                    inventoryId: entity["inventory_id"], 
                    inventoryName: entity["inventory_id@OData.Community.Display.V1.FormattedValue"]
                };
            }
        });
        if (maxInventory) {
            console.log(`Max Quantity: ${maxQuantity}, Inventory ID: ${maxInventory.inventoryId}`);
            inventoryField.setValue([{
                id: maxInventory.inventoryId,
                name: maxInventory.inventoryName, 
                entityType: "cr4fd_inventory" 
            }]);
        }
    } else {
        console.log("No inventory found for the selected product.");
    }
    
}