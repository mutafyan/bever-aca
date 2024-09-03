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
	const allControls = Form.ui.controls.get();
	const hideOnCreate = [
		"cr4fd_name",
		"transactioncurrencyid",
		"cr4fd_mon_total_amount",
		"cr4fd_mon_price_per_unit"
	]
    // Iterate over each control
    if(formType === 2) {
		allControls.forEach(function(control) {
        if (control) {
            control.setDisabled(true);
        }
    	}) 
	}
	// Hide unnecesarry fields when creating new record 
	else if(formType === 1) { 
		hideOnCreate.forEach(function(fieldName) {
			const control = Form.getControl(fieldName);
			if(control){
				control.setVisible(false);
			}
		});
		// Then disable the remained fields
		allControls.forEach(function(control) {
		if (control) {
            control.setDisabled(false);
        }
	}
	)
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
		'<link-entity name="cr4fd_product" from="cr4fd_productid" to="cr4fd_fk_product" link-type="inner" alias="af">'+
			'<link-entity name="cr4fd_price_list_items" from="cr4fd_fk_product" to="cr4fd_productid" link-type="inner" alias="ak" >'+
				'<attribute name="cr4fd_mon_price"/>' +
				'<attribute name="cr4fd_fk_price_list"/>' +
			'</link-entity>'+
		'</link-entity>'+
        '</entity>' +
        '</fetch>';
    fetchXml = "?fetchXml=" + encodeURIComponent(fetchXml);

    try {
        const inventoryLinesArray = await Xrm.WebApi.retrieveMultipleRecords('cr4fd_inventory_product', fetchXml);
        const inventoryLinesQuantity = inventoryLinesArray.entities.length;
        const priceListId  = Form.getAttribute("cr4fd_fk_price_list").getValue()[0]?.id;;
		let totalPrice = 0, quantity=0, price=0, line;
        for(let i=0; i < inventoryLinesQuantity; i++) {
			line = inventoryLinesArray.entities[i];
			if(line["ak.cr4fd_fk_price_list"] === priceListId.replace("{","").replace("}","").toLowerCase()){
				quantity=line["cr4fd_int_quantity"];
				price=line["ak.cr4fd_mon_price"];
				totalPrice += quantity*price;
			}
		}
		Form.getAttribute("cr4fd_mon_total_amount").setValue(totalPrice);
        }
    catch (error) {
        console.error("Error calculating total price of inventory:", error);
    }
}

function autofillName(executionContext) {
	const Form = executionContext.getFormContext();
	if(Form.ui.getFormType() === 1) {
		return;
	}
	const productName = Form.getAttribute("cr4fd_fk_product")?.getValue()[0]?.name;
	Form.getAttribute("cr4fd_name").setValue(productName);
}

async function autofillCurrency(executionContext) {
    const Form = executionContext.getFormContext();
    const priceListField = Form.getAttribute("cr4fd_fk_price_list");
    const currencyField = Form.getAttribute("transactioncurrencyid");

    if (priceListField && priceListField.getValue()) {
        const priceListId = priceListField.getValue()[0].id.replace("{","").replace("}","").toLowerCase();
        await Xrm.WebApi.retrieveRecord("cr4fd_price_list", priceListId, "?$select=_transactioncurrencyid_value").then(
			function success(result) {
				const newCurrency = {
					id: result["_transactioncurrencyid_value"], 
					name: result["_transactioncurrencyid_value@OData.Community.Display.V1.FormattedValue"],
					entityType: "transactioncurrency"
				};
				currencyField.setValue([newCurrency]);
            },
            function error(error) {
                console.log("Error retrieving currency from Price List:", error.message);
            }
        );
    } else {
        // Clear the currency field if no Price List is selected
        currencyField.setValue(null);
    }
}


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

		try {
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
			} catch (error) {
			console.error(error);
		}

}



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
