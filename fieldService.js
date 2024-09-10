// Combine first name and last name to autofill the full name field
function setFullName(executionContext) {
    const formContext = executionContext.getFormContext();
    if (!formContext) return;

    const firstName = formContext.getAttribute("cr4fd_slot_first_name")?.getValue() || "";
    const lastName = formContext.getAttribute("cr4fd_slot_last_name")?.getValue() || "";
    
    if (!firstName && !lastName) return;

    const fullName = `${firstName} ${lastName}`.trim();
    formContext.getAttribute("cr4fd_name").setValue(fullName);
}


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


// Filter contact lookup in work order to show only contacts related to selected account lookup
let filterPointer = null;
function contactLookupFilter(executionContext) {
    const formContext = executionContext.getFormContext();
    const account = formContext.getAttribute("cr4fd_fk_customer")?.getValue();
    if (filterPointer) {
        alert("REMOVING PRESEARCH")
        formContext.getControl("cr4fd_fk_contact").removePreSearch(filterPointer);
    }
    if (account && account.length > 0) {
        // Set the filter function to apply the lookup filter
        filterPointer = filterFunction.bind({ "accountId": account[0].id });
        formContext.getControl("cr4fd_fk_contact").addPreSearch(filterPointer);
    }

}

function filterFunction(executionContext) {
    const formContext = executionContext.getFormContext();
    const accountId = this.accountId;
    const conditions = 
    `<link-entity name="cr4fd_my_position" from="cr4fd_fk_my_contact" to="cr4fd_my_contactid" link-type="inner" alias="aa">
      <link-entity name="cr4fd_account" from="cr4fd_accountid" to="cr4fd_fk_my_account" link-type="inner" alias="ab">
        <filter type="and">
          <condition attribute="cr4fd_accountid" operator="eq" uitype="cr4fd_account" value="${accountId}" />
        </filter>
      </link-entity>
    </link-entity>`
    alert("ADDING FILTER")
    formContext.getControl("cr4fd_fk_contact").addCustomFilter(conditions, "cr4fd_my_contact")
}
