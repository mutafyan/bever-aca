/**
 * In this Resource are stored functions used for Work Order & its related entities
 * Those are:
 *  Bookings 
 */


/**
 * Checks the Work Order's status field, and if it's set to "close-posted",
 * disables all editable fields on the form except the status field.
 */
function disableFieldsOnClosePosted(executionContext) {
    const formContext = executionContext.getFormContext();
    const statusField = formContext.getAttribute("cr4fd_os_status");
    if (statusField) {
        const statusValue = statusField.getValue();
        const closePostedValue = 903020000;
        const warningMessage = "Close-posting will irrevocably generate billing and subtract product quantities needed for this work order";
        if(statusValue !== closePostedValue) {
            formContext.ui.setFormNotification(warningMessage, "INFO", "info1");
        }
        else {
            // disable all fields 
            disableAllFields(formContext);
            // disable related subgrids to prevent adding new records
            disableSubgrids(formContext);
            // Clear info notification
            formContext.ui.clearFormNotification("info1");
        
        }
    }
}

/**
 * Disables all fields on the given form except the status field.
 */
function disableAllFields(formContext) {
    const statusFieldName = "cr4fd_os_status";
    const controls = formContext.ui.controls.get();
    
    // Iterate over each control and disable it if possible
    controls.forEach(control => {
        if (typeof control.setDisabled === "function") {
            if (control) {
                control.setDisabled(true);
            }
        }
    });
}

// Generates a number in format WO-NNN and fills the name field
async function autofillWorkOrderNumber(executionContext) {
    const formContext = executionContext.getFormContext();
    if(formContext.ui.getFormType() !== 1) return; // work only with create form
    // Fetch work orders to determine the global counter
    await Xrm.WebApi.retrieveMultipleRecords("cr4fd_work_order", "?$orderby=createdon desc").then(
        function success(result) {
            const newCounter = ("000" + (result.entities.length + 1)).slice(-3); 
            const workOrderName = `WO-${newCounter}`;
            formContext.getAttribute("cr4fd_name").setValue(workOrderName);
        },
        function error(error) {
            console.error(error.message);
        }
    );    
}


/**
 * Sets a lookup filter on contact field which
 * displays only contact from selected customer
 */
let filterPointer = null;

function contactLookupFilter(executionContext) {
    const formContext = executionContext.getFormContext();
    const account = formContext.getAttribute("cr4fd_fk_customer")?.getValue();

    if (filterPointer) {
        formContext.getControl("cr4fd_fk_contact").removePreSearch(filterPointer);
    }

    if (account && account.length > 0) {
        // Set the filter function to apply the lookup filter
        filterPointer = applyContactFilter.bind(null, formContext, account[0].id);
        formContext.getControl("cr4fd_fk_contact").addPreSearch(filterPointer);
    }
}

function applyContactFilter(formContext, accountId) {
    
    const fetchXml = `
    <fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="true">
        <entity name="cr4fd_my_contact">
            <attribute name="cr4fd_name" />
            <attribute name="cr4fd_my_contactid" />
            <link-entity name="cr4fd_my_position" from="cr4fd_fk_my_contact" to="cr4fd_my_contactid" alias="pos">
                <filter type="and">
                    <condition attribute="cr4fd_fk_my_account" operator="eq" value="${accountId}" />
                </filter>
            </link-entity>
        </entity>
    </fetch>`;

    const layoutXml = `
    <grid name="resultset" object="2" jump="cr4fd_my_contactid" select="1" icon="1" preview="1">
        <row name="result" id="cr4fd_my_contactid">
            <cell name="cr4fd_name" width="300" /> 
        </row>
    </grid>`;


    const viewId = "{00000000-0000-0000-0000-000000000001}";
    const entityName = "cr4fd_my_contact";
    const viewDisplayName = "Filtered Contacts";
    formContext.getControl("cr4fd_fk_contact").addCustomView(
        viewId,
        entityName,
        viewDisplayName,
        fetchXml,
        layoutXml,
        true
    );
    
}


/**
 * Disables related subgrid controls on the main Work Order form to prevent adding new records.
 */
function disableSubgrids(formContext) {
    const subgridNames = ["wo_products", "wo_services", "wo_bookings"];
    
    subgridNames.forEach(subgridName => {
        let subgridControl = formContext.getControl(subgridName);
        if (subgridControl) {
            // Disable the subgrid to prevent adding new records
            subgridControl.setDisabled(true);
        }
    });
}


/*
 * Function called on ribbon button click
 * Calls an action that generates new actuals for a work order
 */
async function generateNewActuals(formContext) {
    const workOrderId = formContext.data.entity.getId().replace('{', '').replace('}', '');

    // Define the request action parameters
    const requestAction = {
        "WorkOrder": {
            id: workOrderId,
            entityType: "cr4fd_work_order"
        },
 
        getMetadata: function () {
            return {
                boundParameter: null,
                parameterTypes: {
                    "WorkOrder": {
                        typeName: "mscrm.cr4fd_work_order", 
                        structuralProperty: 5 
                    }
                },
                operationType: 0, 
                operationName: "cr4fd_CreateNewActualsforWorkOrderAction" 
            };
        }
    };

    const result = await Xrm.WebApi.online.execute(requestAction);
    if (result.ok) {
        const response = await result.json();
        const status = response.Status;
        console.log("Action executed successfully. Status: " + status);
        // display a message to the user
        Xrm.Navigation.openAlertDialog({ text: "Actuals generated successfully." });
    } else {
        console.error("Error executing action: ", result.statusText);
        Xrm.Navigation.openErrorDialog({ message: "Error executing action: " + result.statusText });
    }
}



/**
 * Works on ribbon button click
 * Calculates total products and services amounts in work order form
 */
async function calculateAmount(formContext) {
    const productAmountField = formContext.getAttribute("cr4fd_mon_total_products_amount");
    const serviceAmountField = formContext.getAttribute("cr4fd_mon_total_services_amount");
    
    const currencyId = formContext.getAttribute("transactioncurrencyid").getValue()[0].id.replace(/[{}]/g, "").toLowerCase();
    const workOrderId = formContext.data.entity.getId().replace(/[{}]/g, "");
    
    let exchangeRate = 1;
    
    let productXml = `<fetch aggregate="true">
        <entity name="cr4fd_work_order_product">
            <attribute name="cr4fd_mon_total_amount" alias="totalamount_sum" aggregate="sum" />
            <attribute name="transactioncurrencyid" alias="currency" groupby="true" />
            <filter>
            <condition attribute="cr4fd_fk_work_order" operator="eq" uitype="cr4fd_work_order" value="${workOrderId}" />
            </filter>
        </entity>
    </fetch>`;
    
    productXml = `?fetchXml=${encodeURIComponent(productXml)}`;
    
    let serviceXml = `<fetch aggregate="true">
        <entity name="cr4fd_workorderservice">
            <attribute name="cr4fd_mon_total_amount" alias="totalamount_sum" aggregate="sum" />
            <attribute name="transactioncurrencyid" alias="currency" groupby="true" />
            <filter>
            <condition attribute="cr4fd_fk_work_order" operator="eq" uitype="cr4fd_work_order" value="${workOrderId}" />
            </filter>
        </entity>
    </fetch>`;
    
    serviceXml = `?fetchXml=${encodeURIComponent(serviceXml)}`;
    
    
    const responseProducts = await Xrm.WebApi.retrieveMultipleRecords("cr4fd_work_order_product", productXml);
    if (responseProducts.entities.length > 0 && productAmountField) {
        if (currencyId) {
            exchangeRate = await getExchangeRate(currencyId);
        }
        const totalAmountSum = responseProducts.entities[0]["totalamount_sum"] * exchangeRate;
        productAmountField.setValue(totalAmountSum);
    } else {
        console.log("No product records found.");
        productAmountField.setValue(null);
    }
    

    const responseService = await Xrm.WebApi.retrieveMultipleRecords("cr4fd_workorderservice", serviceXml);
    if (responseService.entities.length > 0 && serviceAmountField) {
        if (currencyId) {
            exchangeRate = await getExchangeRate(currencyId);
        }
        const totalAmountSum = responseService.entities[0]["totalamount_sum"] * exchangeRate;
        serviceAmountField.setValue(totalAmountSum);
    } else {
        console.log("No service records found.");
        serviceAmountField.setValue(null);
    }
    
}


// get exchange rate with base currency
async function getExchangeRate(currencyId) {
    try {
        const result = await Xrm.WebApi.retrieveRecord("transactioncurrency", currencyId, "?$select=exchangerate");
        return parseFloat(result.exchangerate);
    } catch (error) {
        console.error("Error retrieving exchange rate: ", error);
        return 1; // Fallback to 1 if something goes wrong (no conversion)
    }
}
