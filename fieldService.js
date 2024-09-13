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


let filterPointer = null;

function contactLookupFilter(executionContext) {
    const formContext = executionContext.getFormContext();
    const account = formContext.getAttribute("cr4fd_fk_customer")?.getValue();

    if (filterPointer) {
        formContext.getControl("cr4fd_fk_contact").removePreSearch(filterPointer);
    }

    if (account && account.length > 0) {
        // Set the filter function to apply the lookup filter
        filterPointer = applyContactFilter.bind(null, executionContext, account[0].id);
        formContext.getControl("cr4fd_fk_contact").addPreSearch(filterPointer);
    }
}

function applyContactFilter(executionContext, accountId) {
    const formContext = executionContext.getFormContext();
    try {
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
                <cell name="cr4fd_name" width="300" /> <!-- Display the name attribute -->
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
    } catch (error) {
        console.error("Error applying contact filter: ", error);
    }
}
