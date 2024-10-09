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



/**
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

/**
 * Leaves only one lookup field visible in invoice line form
 * either to work order product or to work order service
 */
function controlLookupVisibility(executionContext) {
    var formContext = executionContext.getFormContext();

    var workOrderProductField = formContext.getAttribute("cr4fd_fk_work_order_product");
    var workOrderServiceField = formContext.getAttribute("cr4fd_fk_workorderservice");

    var workOrderProductControl = formContext.getControl("cr4fd_fk_work_order_product");
    var workOrderServiceControl = formContext.getControl("cr4fd_fk_workorderservice");

    if (workOrderProductField.getValue() != null) {
        // Hide Work Order Service lookup when Work Order Product has a value
        workOrderServiceControl.setVisible(false);
    } else {
        workOrderServiceControl.setVisible(true);
    }

    if (workOrderServiceField.getValue() != null) {
        // Hide Work Order Product lookup when Work Order Service has a value
        workOrderProductControl.setVisible(false);
    } else {
        workOrderProductControl.setVisible(true);
    }
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
