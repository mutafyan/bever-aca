
/**
 * Function is set to work on ribbon button click
 * Deletes all related price list items and creates new ones
 * Price is being set to product's default price
 */
async function initPriceList(formContext) {
    const priceListId = formContext.data.entity.getId().replace('{','').replace('}','').toLowerCase();
    const priceListCurrencyId = formContext.getAttribute("transactioncurrencyid").getValue()[0]?.id.replace('{','').replace('}','').toLowerCase();

    // Fetch and delete existing Price List Items
    let fetchXml = '<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">' +
        '<entity name="cr4fd_price_list_items">' +
            '<attribute name="cr4fd_price_list_itemsid"/>' +
            '<attribute name="cr4fd_name"/>' +
            '<order attribute="cr4fd_name" descending="false"/>' +
            '<filter type="and">' +
                '<condition attribute="cr4fd_fk_price_list" operator="eq" uitype="cr4fd_price_list" value="'+ priceListId +'"/>' +
            '</filter>' +
        '</entity>' +
    '</fetch>';

    fetchXml = "?fetchXml=" + encodeURIComponent(fetchXml);

    try {
        const resultArray = await Xrm.WebApi.retrieveMultipleRecords('cr4fd_price_list_items', fetchXml);
        
        // Delete the Price List Items
        if (resultArray.entities.length > 0) {
            for (let i = 0; i < resultArray.entities.length; i++) {
                const itemId = resultArray.entities[i].cr4fd_price_list_itemsid;
                await Xrm.WebApi.deleteRecord('cr4fd_price_list_items', itemId);
                console.log('Deleted Price List Item with ID:', itemId);
            }
        }

        // retrieve all products
        const productFetchXml = '<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">' +
            '<entity name="cr4fd_product">' +
                '<attribute name="cr4fd_productid"/>' +
                '<attribute name="cr4fd_name"/>' +
                '<attribute name="cr4fd_mon_unit_price"/>' +
                '<attribute name="cr4fd_mon_price_per_hour"/>' +
                '<attribute name="transactioncurrencyid"/>' +
            '</entity>' +
        '</fetch>';


        const productResult = await Xrm.WebApi.retrieveMultipleRecords('cr4fd_product', "?fetchXml=" + encodeURIComponent(productFetchXml));
        let exchangeRate = 1;
        if (productResult.entities.length > 0) {
            for (let i = 0; i < productResult.entities.length; i++) {
                const productId = productResult.entities[i].cr4fd_productid;
                const productName = productResult.entities[i].cr4fd_name;
                const defaultPrice = productResult.entities[i].cr4fd_mon_unit_price ? productResult.entities[i].cr4fd_mon_unit_price : productResult.entities[i].cr4fd_mon_price_per_hour;
                const productCurrencyId = productResult.entities[i]._transactioncurrencyid_value;
                if(productCurrencyId !== priceListCurrencyId){
                    exchangeRate = await getRelativeExchangeRate(priceListCurrencyId, productCurrencyId);
                }
                // Create new Price List Item with currency from Price List and Default price of product
                const priceListItemData = {
                    "cr4fd_fk_product@odata.bind": "/cr4fd_products(" + productId + ")",
                    "cr4fd_fk_price_list@odata.bind": "/cr4fd_price_lists(" + priceListId + ")",
                    "cr4fd_mon_price": defaultPrice * exchangeRate,
                    "transactioncurrencyid@odata.bind": "/transactioncurrencies(" + priceListCurrencyId+ ")", 
                    "cr4fd_name": productName 
                };
                await Xrm.WebApi.createRecord("cr4fd_price_list_items", priceListItemData);
            }
            Xrm.Navigation.openAlertDialog({ text: "New Price List Items have been created for all Products." });
        } else {
            Xrm.Navigation.openAlertDialog({ text: "No Products found to create Price List Items." });
        }
    } catch (error) {
        console.error("Error processing Price List Items: ", error.message);
        Xrm.Navigation.openAlertDialog({ text: "An error occurred while processing the Price List Items." });
    } finally {
        formContext.data.refresh();
    }
}


// A function to get the exchange rate between two currencies. Not compared to the base currency.
async function getRelativeExchangeRate(priceListCurrencyId, productCurrencyId) {
    let fetchXml = `
    <fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">
    <entity name="transactioncurrency">
    <attribute name="transactioncurrencyid"/>
    <attribute name="exchangerate"/>
    <order attribute="currencyname" descending="false"/>
    <filter type="and">
    <condition attribute="transactioncurrencyid" operator="in">
    <value uitype="transactioncurrency">${priceListCurrencyId}</value>
    <value uitype="transactioncurrency">${productCurrencyId}</value>
    </condition>
    </filter>
    </entity>
    </fetch>`;
    
    const result = await Xrm.WebApi.retrieveMultipleRecords("transactioncurrency", `?fetchXml=${encodeURIComponent(fetchXml)}`);
    let exchangeRates = {};
    result.entities.forEach(currency => {
        exchangeRates[currency.transactioncurrencyid] = parseFloat(currency.exchangerate);
    });
    const relativeExchangeRate = exchangeRates[priceListCurrencyId] / exchangeRates[productCurrencyId];
    return relativeExchangeRate;
    
}
