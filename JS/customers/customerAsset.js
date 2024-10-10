// Auto fill customer asset name with XXX-123 pattern
async function autofillAssetName(executionContext) {
    const formContext = executionContext.getFormContext();
    if(formContext.ui.getFormType() !== 1) return; // work only with create form
    const account = formContext.getAttribute("cr4fd_fk_my_account")?.getValue();
    if (account) {
        const accountName = account[0]?.name || "";
        if (!accountName) return; 
        const shortName = accountName.substring(0, 3).toUpperCase();
        // Fetch customer assets to determine the global counter
        await Xrm.WebApi.retrieveMultipleRecords("cr4fd_customer_asset", "?$orderby=createdon desc").then(
            function success(result) {
                const newCounter = ("000" + (result.entities.length + 1)).slice(-3); 
                const assetName = `${shortName}-${newCounter}`;
                formContext.getAttribute("cr4fd_name").setValue(assetName);
            },
            function error(error) {
                console.error(error.message);
            }
        );
    }
}