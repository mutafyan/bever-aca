// Calculate total of work order services
function calculateWorkOrderServicesAmount(executionContext) {
    const formContext = executionContext.getFormContext();
    const amountField = formContext.getAttribute("cr4fd_mon_total_amount");
    const pricePerHour = formContext.getAttribute("cr4fd_mon_price_per_hour")?.getValue();
    const durationMinutes = formContext.getAttribute("cr4fd_int_duration")?.getValue();
    if(durationMinutes && pricePerHour && amountField) {
        const totalAmount = pricePerHour * durationMinutes / 60;
        amountField.setValue(totalAmount);
    }
}

// Autofill price per hour from selected service
async function autofillPricePerHour(executionContext) {
    const formContext = executionContext.getFormContext();
    const serviceLookup = formContext.getAttribute("cr4fd_fk_service")?.getValue();
    if (!serviceLookup) return;
    const serviceId = serviceLookup[0].id.replace("{", "").replace("}","").toLowerCase();

    const service = await Xrm.WebApi.retrieveRecord("cr4fd_product", serviceId, "?$select=cr4fd_mon_price_per_hour,_transactioncurrencyid_value");
    if (!service) return;

    const pricePerHour = service.cr4fd_mon_price_per_hour;
    const serviceCurrencyId = service._transactioncurrencyid_value;

    if (serviceCurrencyId && pricePerHour) {
        formContext.getAttribute("transactioncurrencyid").setValue([{
            id: serviceCurrencyId,
            name: service["_transactioncurrencyid_value@OData.Community.Display.V1.FormattedValue"],
            entityType: "transactioncurrency"
        }]);
        formContext.getAttribute("cr4fd_mon_price_per_hour").setValue(pricePerHour);

    }
}