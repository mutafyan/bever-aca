function changeName (executionContext) {
	const Form = executionContext.getFormContext();
	let name = "";
	const lookup = Form.getAttribute("cr4fd_fk_product").getValue();
	if(lookup) {
		name = lookup[0]?.name;
	}
	Form.getAttribute("cr4fd_name").setValue(name);
}


function hideBasedOnType (executionContext) {
	const Form = executionContext.getFormContext();
	const option = Form.getAttribute("cr4fd_os_type").getSelectedOption().text;
	if(option && option === "Service") {
		Form.getControl("cr4fd_mon_unit_price").setVisible(false);	
	} else {
		Form.getControl("cr4fd_mon_unit_price").setVisible(true);
	}
	
}

function totalAmount(executionContext) {
	const Form = executionContext.getFormContext();
	const pricePerUnit = Form.getAttribute("cr4fd_mon_price_per_unit").getValue();
	const quantity = Form.getAttribute("cr4fd_int_quantity").getValue();
	Form.getAttribute("cr4fd_mon_total_amount").setValue(pricePerUnit*quantity);
}

function toggleFieldsBasedOnFormType(executionContext) {
	const Form = executionContext.getFormContext();
    let formType = Form.ui.getFormType();
    if(formType === 2) {
    	Form.getControl("cr4fd_fk_product").setDisabled(true);
    	Form.getControl("cr4fd_fk_inventory").setDisabled(true);	
    	Form.getControl("cr4fd_int_quantity").setDisabled(true);		
    	Form.getControl("cr4fd_mon_price_per_unit").setDisabled(true);	
    } else if (formType === 1) {
    	Form.getControl("cr4fd_fk_product").setDisabled(false);
    	Form.getControl("cr4fd_fk_inventory").setDisabled(false);	
    	Form.getControl("cr4fd_int_quantity").setDisabled(false);		
    	Form.getControl("cr4fd_mon_price_per_unit").setDisabled(false);	
    } else {
    	// pass
    }
    
}

async function calculateTotalPriceOfInventory(executionContext) {
    const Form = executionContext.getFormContext();
	const inventoryId = Form.data.entity.getId();

    let fetchXml = '<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">' +
        '<entity name="cr4fd_inventory_product">' +
        '<attribute name="cr4fd_inventory_productid"/>' +
        '<attribute name="cr4fd_name"/>' +
        '<attribute name="cr4fd_int_quantity"/>' +
        '<attribute name="cr4fd_fk_product"/>' +
		'<order attribute="cr4fd_name" descending="false"/>' +
		'<filter type="and">' +
            '<condition attribute="cr4fd_fk_inventory" operator="eq" uitype="cr4fd_inventory" value="' + inventoryId + '" />' +
        '</filter>' +
        '</entity>' +
        '</fetch>';
    fetchXml = "?fetchXml=" + encodeURIComponent(fetchXml);

    try {
        const inventoryLinesArray = await Xrm.WebApi.retrieveMultipleRecords('cr4fd_inventory_product', fetchXml);
        const inventoryLinesQuantity = inventoryLinesArray.entities.length;
        const priceList = Form.getAttribute("cr4fd_fk_price_list").getValue();

        let inventoryLine, productId, quantity = 0, totalPrice = 0;

        if (priceList && priceList[0]) {
            const priceListId = priceList[0].id;
            for (let i = 0; i < inventoryLinesQuantity; i++) {
                inventoryLine = inventoryLinesArray.entities[i];
                quantity = parseFloat(inventoryLine["cr4fd_int_quantity"]) || 0;

                productId = inventoryLine["_cr4fd_fk_product_value"];
                
                fetchXml = '<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">' +
                    '<entity name="cr4fd_price_list_items">' +
                    '<attribute name="cr4fd_price_list_itemsid" />' +
                    '<attribute name="cr4fd_name" />' +
					'<attribute name="cr4fd_mon_price" />' +
                    '<filter type="and">' +
                    '<condition attribute="cr4fd_fk_product" operator="eq" uitype="cr4fd_product" value="' + productId + '" />' +
                    '<condition attribute="cr4fd_fk_price_list" operator="eq" uitype="cr4fd_price_list" value="' + priceListId + '" />' +
                    '</filter>' +
                    '<order attribute="cr4fd_name" descending="false"/>' +
                    '</entity>' +
                    '</fetch>';
                fetchXml = "?fetchXml=" + encodeURIComponent(fetchXml);
                let priceListLinesArray = await Xrm.WebApi.retrieveMultipleRecords("cr4fd_price_list_items", fetchXml);
                let price = 0;

                if (priceListLinesArray && priceListLinesArray.entities) {
                    for (let j = 0; j < priceListLinesArray.entities.length; j++) {
                        price = parseFloat(priceListLinesArray.entities[0]["cr4fd_mon_price"]);
                        totalPrice += price * quantity;
                    }
                } else {
                    console.warn("An error occurred while fetching Price List Lines.");
                }
            }
        }
    } catch (error) {
        console.error("Error calculating total price of inventory:", error);
    }
}
