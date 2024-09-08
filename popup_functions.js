window.onload = async (event) => {
    let fetchXml = '<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">' +
        '<entity name="cr4fd_product">' +
        '<attribute name="cr4fd_name" />' +
        '<attribute name="cr4fd_productid" />' +
        '</entity>' +
        '</fetch>';
    
    fetchXml = "?fetchXml=" + encodeURIComponent(fetchXml);
    let products = await parent.Xrm.WebApi.retrieveMultipleRecords('cr4fd_product', fetchXml);

    let productsDropDown = document.getElementById("products");
    for (let i = 0; i < products.entities.length; i++) {
        let product = products.entities[i];
        // set products guid as its value
        productsDropDown.options[productsDropDown.options.length] = new Option(product["cr4fd_name"], product["cr4fd_productid"]);
    }
};

function readParameterValues(parameterName) {
    if(location.search) {
        if(location.search.split("=")[1]) {
            return JSON.parse(decodeURIComponent(location.search.split("=")[1]))[parameterName]
            .replace("{","").replace("}","").toLowerCase();
        }
    }
}

async function submitForm() {
    const productId = document.getElementById("products").value;
    const inventoryId = readParameterValues("inventoryId");
    const quantity = parseInt(document.getElementById("quantity").value);
    const operation = document.getElementById("operation").value; // In or Out

    // Skip the function if any value equals null
    if(!productId || !inventoryId || !quantity  || !operation) {
        return;
    }
    try {
        // Fetch the current inventory for the selected product
        let fetchXml = '<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">' +
            '<entity name="cr4fd_inventory_product">' +
            '<attribute name="cr4fd_inventory_productid"/>' +
            '<attribute name="cr4fd_int_quantity"/>' +
                '<filter type="and">' +
                    '<condition attribute="cr4fd_fk_inventory" operator="eq" value="' + inventoryId + '"/>' +
                    '<condition attribute="cr4fd_fk_product" operator="eq" value="' + productId + '"/>' +
                '</filter>' +
            '</entity>' +
            '</fetch>';
    
        fetchXml = "?fetchXml=" + encodeURIComponent(fetchXml);
        const inventoryResponse = await parent.Xrm.WebApi.retrieveMultipleRecords('cr4fd_inventory_product', fetchXml);
        const inventory = inventoryResponse.entities.length > 0 ? inventoryResponse.entities[0] : null;
    
        if (operation === "in") {
            // Add the quantity if the product exists in inventory
            if (inventory) {
                let updatedQuantity = parseInt(inventory.cr4fd_int_quantity) + quantity;
                await updateInventoryProduct(inventory.cr4fd_inventory_productid, updatedQuantity);
            } else {
                // If it doesn't exist, create a new inventory record
                await createInventoryProduct(inventoryId, productId, quantity);
            }
            alert("Quantity successfully added!");
        } else if (operation === "out") {
            if (inventory) {
                let updatedQuantity = parseInt(inventory.cr4fd_int_quantity) - quantity;
                if (updatedQuantity >= 0) {
                    await updateInventoryProduct(inventory.cr4fd_inventory_productid, updatedQuantity);
                    alert("Quantity successfully substracted!");
                } else {
                    alert("Error: Quantity to substract exceeds available stock.");
                }
            } else {
                alert("Error: Product does not exist in the inventory.");
            }
        }
    } catch (error) {
        console.error(error);
        alert("An error occurred while processing the operation.");
    }
}

async function updateInventoryProduct(inventoryProductId, newQuantity) {
    const entity = {
        "cr4fd_int_quantity": newQuantity
    };
    return await parent.Xrm.WebApi.updateRecord("cr4fd_inventory_product", inventoryProductId, entity);
}

async function createInventoryProduct(inventoryId, productId, quantity) {
    const entity = {
        "cr4fd_fk_inventory@odata.bind": "/cr4fd_inventories(" + inventoryId + ")",
        "cr4fd_fk_product@odata.bind": "/cr4fd_products(" + productId + ")",
        "cr4fd_int_quantity": quantity,
    };
    return await parent.Xrm.WebApi.createRecord("cr4fd_inventory_product", entity);
}

function cancelForm() {
    window.close();
}
