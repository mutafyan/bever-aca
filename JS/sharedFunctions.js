// Functions here are used in more than one entities
 

/* Combine first name and last name to autofill the full name field
 * used in Resource and Customer
 */
function setFullName(executionContext) {
    const formContext = executionContext.getFormContext();
    if (!formContext) return;

    const firstName = formContext.getAttribute("cr4fd_slot_first_name")?.getValue() || "";
    const lastName = formContext.getAttribute("cr4fd_slot_last_name")?.getValue() || "";
    
    if (!firstName && !lastName) return;

    const fullName = `${firstName} ${lastName}`.trim();
    formContext.getAttribute("cr4fd_name").setValue(fullName);
}

/* Get currency from given price list lookup and set it to entity
 * used in Inventory, Price List Item and Work Order
 */ 
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

/**
 * Used in work order related entities: Booking, WO Product & WO Service
 * Disables all editable fields on the related sub-entity form if the parent Work Order is "close-posted". 
 */
function disableFieldsIfParentClosePosted(executionContext) {
    const formContext = executionContext.getFormContext();
    
    // Retrieve the parent Work Order reference
    const parentWorkOrderField = formContext.getAttribute("cr4fd_fk_work_order");
    if (parentWorkOrderField) {
        const parentWorkOrderRef = parentWorkOrderField.getValue();
        if (parentWorkOrderRef && parentWorkOrderRef.length > 0) {
            // Retrieve the parent Work Order's status
            Xrm.WebApi.retrieveRecord("cr4fd_work_order", parentWorkOrderRef[0].id, "?$select=cr4fd_os_status").then(
                function success(result) {
                    const statusValue = result["cr4fd_os_status"];
                    const closePostedValue = 903020000;
    
                    if (statusValue === closePostedValue) {
                        disableAllFields(formContext);
                    } else {
                        enableAllFields(formContext);
                    }
                },
                function(error) {
                    console.error("Error retrieving parent Work Order status: ", error.message);
                }
            );
        }
    }
}
