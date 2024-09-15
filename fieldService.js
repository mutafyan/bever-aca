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
        filterPointer = applyContactFilter.bind(null, formContext, account[0].id);
        formContext.getControl("cr4fd_fk_contact").addPreSearch(filterPointer);
    }
}

function applyContactFilter(formContext, accountId) {
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
    } catch (error) {
        console.error("Error applying contact filter: ", error);
    }
}


let filterPointerProduct = null;
function productLookupFilter(executionContext) {
    const formContext = executionContext.getFormContext();
    const inventory = formContext.getAttribute("cr4fd_fk_inventory")?.getValue();
    if (filterPointer) {
        formContext.getControl("cr4fd_fk_product").removePreSearch(filterPointer);
    }

    if (inventory && inventory.length > 0) {
        // Set the filter function to apply the lookup filter
        filterPointer = applyProductFilter.bind(null, formContext, inventory[0].id);
        formContext.getControl("cr4fd_fk_product").addPreSearch(filterPointer);
    }

}

function applyProductFilter (formContext, inventoryId) {
    try {
        const fetchXml = `
        <fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="true">
            <entity name="cr4fd_product">
                <attribute name="cr4fd_productid"/>
                <attribute name="cr4fd_name"/>
                <attribute name="cr4fd_mon_unit_price"/>
                <order attribute="cr4fd_name" descending="false"/>
                    <filter type="and">
                        <condition attribute="cr4fd_os_type" operator="eq" value="903020000"/> <!-- Select only type product  -->
                    </filter>
                <link-entity name="cr4fd_inventory_product" from="cr4fd_fk_product" to="cr4fd_productid" link-type="inner" alias="ac">
                    <filter type="and">
                        <condition attribute="cr4fd_fk_inventory" operator="eq" uitype="cr4fd_inventory" value="${inventoryId}"/>
                    </filter>
                </link-entity>
            </entity>   
        </fetch>`;

        const layoutXml = `
        <grid name="resultset" object="2" jump="cr4fd_productid" select="1" icon="1" preview="1">
            <row name="result" id="cr4fd_productid">
                <cell name="cr4fd_name" width="300" /> 
                <cell name="cr4fd_name" width="300" /> 
            </row>
        </grid>`;


        const viewId = "{00000000-0000-0000-0000-000000000002}";
        const entityName = "cr4fd_product";
        const viewDisplayName = "Filtered Products";
        formContext.getControl("cr4fd_fk_product").addCustomView(
            viewId,
            entityName,
            viewDisplayName,
            fetchXml,
            layoutXml,
            true
        );
    } catch (error) {
        console.error("Error applying product filter: ", error);
    }
}


