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