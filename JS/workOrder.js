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
        if (statusValue === closePostedValue) {
            // disable all fields except the status field
            disableAllFields(formContext);
            // disable related subgrids to prevent adding new records
            disableSubgrids(formContext);
        } else {
            // re-enable fields if status changes from "close-posted"
            enableAllFields(formContext);
            enableSubgrids(formContext);
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
    // enable the status field
    formContext.getControl(statusFieldName)?.setDisabled(true);
}

/**
 * Enables all fields on the given form
 */
function enableAllFields(formContext) {
    const statusFieldName = "cr4fd_os_status";
    
    const controls = formContext.ui.controls.get();
    
    // Iterate over each control and enable it
    controls.forEach(control => {
        if (control && typeof control.setDisabled === "function") {
            control.setDisabled(false);      
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
 * Enables related subgrid controls on the main Work Order form.
 */
function enableSubgrids(formContext) {
    const subgridNames = ["wo_products", "wo_services", "wo_bookings"];
    
    subgridNames.forEach(subgridName => {
        let subgridControl = formContext.getControl(subgridName);
        if (subgridControl) {
            subgridControl.setDisabled(false);
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
