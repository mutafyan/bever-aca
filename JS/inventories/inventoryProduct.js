// TODO: work on logic
function toggleFieldsBasedOnFormType(executionContext) {
	const Form = executionContext.getFormContext();
    let formType = Form.ui.getFormType();
	const allControls = Form.ui.controls.get();
	const hideOnCreate = [
		"cr4fd_name",
		"transactioncurrencyid",
		"cr4fd_mon_total_amount",
		"cr4fd_mon_price_per_unit"
	]
	
    // Iterate over each control and disable
    if(formType === 2) {
		allControls.forEach(function(control) {
        if (control) {
            control.setDisabled(true);
        }
    	}) 
	}
	// Hide unnecesarry fields when creating new record 
	else if(formType === 1) { 
		// enable the fields
		allControls.forEach(function(control) {
		if (control) {
			control.setDisabled(false);
		}
		})
		// disable and hide those that are not neccessary
		hideOnCreate.forEach(function(fieldName) {
			const control = Form.getControl(fieldName);
			if(control){
				control.setVisible(false);
				control.setDisabled(true);
			}
		});

		// disable the product field
		const product = Form.getControl("cr4fd_fk_product");
		if(product) {
			product.setDisabled(true);	
		}
	} 
}

// Calculates and sets total amount 
function totalAmount(executionContext) {
	const Form = executionContext.getFormContext();
	const pricePerUnit = Form.getAttribute("cr4fd_mon_price_per_unit").getValue();
	const quantity = Form.getAttribute("cr4fd_int_quantity").getValue();
	Form.getAttribute("cr4fd_mon_total_amount").setValue(pricePerUnit*quantity);
}

// Retrieves and sets inventory product currency from related inventory's price list
async function autofillCurrencyForInventoryProducts(executionContext) {
	const Form = executionContext.getFormContext();
	if(Form.ui.getFormType() === 1) {
		return;
	}
	const inventoryId = Form.getAttribute("cr4fd_fk_inventory").getValue()[0]?.id;
	const productId = Form.getAttribute("cr4fd_fk_product").getValue()[0]?.id;
    const currencyField = Form.getAttribute("transactioncurrencyid");

	let fetchXml = '<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">' +
        '<entity name="cr4fd_inventory_product">' +
        '<attribute name="cr4fd_inventory_productid"/>' +
        '<attribute name="cr4fd_name"/>' +
        '<attribute name="cr4fd_int_quantity"/>' +
        '<attribute name="cr4fd_fk_product"/>' +
		'<order attribute="cr4fd_name" descending="false"/>' +
		'<filter type="and">' +
            '<condition attribute="cr4fd_fk_inventory" operator="eq" uitype="cr4fd_inventory" value="' + inventoryId + '" />' +
			'<condition attribute="cr4fd_fk_product" operator="eq" uitype="cr4fd_product" value="' + productId + '" />' +
        '</filter>' +
		'<link-entity name="cr4fd_inventory" from="cr4fd_inventoryid" to="cr4fd_fk_inventory" link-type="inner" alias="al">'+
			'<link-entity name="cr4fd_price_list" from="cr4fd_price_listid" to="cr4fd_fk_price_list" link-type="inner" alias="am">'+
				'<attribute name="transactioncurrencyid"/>' +
			'</link-entity>'+
		'</link-entity>'+
        '</entity>' +
        '</fetch>';
    fetchXml = "?fetchXml=" + encodeURIComponent(fetchXml);

		
    const resultArray = await Xrm.WebApi.retrieveMultipleRecords('cr4fd_inventory_product', fetchXml);
    if(resultArray) {
        const result = resultArray.entities[0];
        const currencyObj = {
            id: result["am.transactioncurrencyid"],
            name: result["am.transactioncurrencyid@OData.Community.Display.V1.FormattedValue"],
            entityType: result["am.transactioncurrencyid@Microsoft.Dynamics.CRM.lookuplogicalname"],
        }
        currencyField.setValue([currencyObj]);
    }
		
}


// Set price per unit in inventory product from corresponding price list item
// if not present -> set price from product record
function setPricePerUnit(executionContext) {
    const Form = executionContext.getFormContext();

    const productLookup = Form.getAttribute("cr4fd_fk_product").getValue();
    const inventoryLookup = Form.getAttribute("cr4fd_fk_inventory").getValue();

    if (productLookup && inventoryLookup) {
        const productId = productLookup[0].id;
        const inventoryId = inventoryLookup[0].id;

        const fetchXml = '<fetch top="1">' +
                '<entity name="cr4fd_inventory_product">' +
                    '<attribute name="cr4fd_inventory_productid"/>' +
                    '<filter type="and">' +
                        '<condition attribute="cr4fd_fk_inventory" operator="eq" value="' + inventoryId + '" />' +
                        '<condition attribute="cr4fd_fk_product" operator="eq" value="' + productId + '" />' +
                    '</filter>' +
                    '<link-entity name="cr4fd_inventory" from="cr4fd_inventoryid" to="cr4fd_fk_inventory" link-type="inner" alias="al">' +
                        '<link-entity name="cr4fd_price_list" from="cr4fd_price_listid" to="cr4fd_fk_price_list" link-type="inner" alias="am">' +
                            '<link-entity name="cr4fd_price_list_items" from="cr4fd_fk_price_list" to="cr4fd_price_listid" link-type="inner" alias="pli">' +
                                '<attribute name="cr4fd_mon_price"/>' +
                                '<filter type="and">' +
                                    '<condition attribute="cr4fd_fk_product" operator="eq" value="' + productId + '" />' +
                                '</filter>' +
                            '</link-entity>' +
                        '</link-entity>' +
                    '</link-entity>' +
                '</entity>' +
            '</fetch>';

        Xrm.WebApi.retrieveMultipleRecords("cr4fd_inventory_product", "?fetchXml=" + encodeURIComponent(fetchXml)).then(
            function success(result) {
                if (result.entities.length > 0 && result.entities[0]["pli.cr4fd_mon_price"] !== undefined) {
                    const price = result.entities[0]["pli.cr4fd_mon_price"];
                    Form.getAttribute("cr4fd_mon_price_per_unit").setValue(price);
                } else {
                    // If no price in the Price List, retrieve the default price from the Product entity
                    Xrm.WebApi.retrieveRecord("cr4fd_product", productId, "?$select=cr4fd_mon_unit_price").then(
                        function success(product) {
                            if (product.cr4fd_mon_unit_price) {
                                Form.getAttribute("cr4fd_mon_price_per_unit").setValue(product.cr4fd_mon_unit_price);
                            }
                        },
                        function error(error) {
                            console.log("Error retrieving default price from Product:", error.message);
                        }
                    );
                }
            },
            function error(error) {
                console.log("Error retrieving price from Price List:", error.message);
            }
        );
    }
}

// Set name of product from lookup
function changeName (executionContext) {
	const Form = executionContext.getFormContext();
	let name = "";
	const lookup = Form.getAttribute("cr4fd_fk_product").getValue();
	if(lookup) {
		name = lookup[0]?.name;
	}
	Form.getAttribute("cr4fd_name").setValue(name);
}


/**
 * Check for existing inventory product with selected inventory and product
 * if exist -> display error message on product field
 */
async function checkProductAssociation(executionContext) {
	const formContext = executionContext.getFormContext();
    const inventory = formContext.getAttribute("cr4fd_fk_inventory").getValue();
	const product = formContext.getAttribute("cr4fd_fk_product").getValue();
	if(!inventory || !product) {
		return;
	}
	const productId = product[0]?.id;
	const inventoryId = inventory[0]?.id;
	if (productId && inventoryId) {
		let fetchXml = '<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">' +
		'<entity name="cr4fd_inventory_product">' +
		'<attribute name="cr4fd_inventory_productid"/>' +
		'<filter type="and">' +
		'<condition attribute="cr4fd_fk_product" operator="eq" value="' + productId + '"/>' +
		'<condition attribute="cr4fd_fk_inventory" operator="eq" value="' + inventoryId + '"/>' +
		'</filter>' +
		'</entity>' +
		'</fetch>';
		fetchXml = "?fetchXml=" + encodeURIComponent(fetchXml);
		
        const result = await Xrm.WebApi.retrieveMultipleRecords('cr4fd_inventory_product', fetchXml);
        
        if (result.entities.length > 0) {
            // Product is already associated with the inventory
            formContext.getControl("cr4fd_fk_product").setNotification("Product is already added", "product_notification");
        } else {
            // Clear the notification if no matching product-inventory is found
            formContext.getControl("cr4fd_fk_product").clearNotification("product_notification");
        }
		
	}
}
	
// Enable product field after inventory is selected
function enableProductField(executionContext) {
    const formContext = executionContext.getFormContext();
    let formType = formContext.ui.getFormType();
    if(formType === 1) { 
        productField = formContext.getControl("cr4fd_fk_product");
        inventoryField = formContext.getAttribute("cr4fd_fk_inventory");
        if(inventoryField.getValue()) {
        if(productField) {
            // Disable if true
            formContext.getControl("cr4fd_fk_inventory").clearNotification("inventory_notification");
            productField.setDisabled(false);
        }
    } else 
        formContext.getControl("cr4fd_fk_inventory").setNotification("Choose an inventory", "inventory_notification");
    }
}

