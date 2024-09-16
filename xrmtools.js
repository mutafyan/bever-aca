async function calculateTotalPriceOfInventory(formContext) {
	const inventoryId = formContext.data.entity.getId();

    let fetchXml = '<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">' +
        '<entity name="cr4fd_inventory_product">' +
        '<attribute name="cr4fd_inventory_productid"/>' +
        '<attribute name="cr4fd_name"/>' +
        '<attribute name="cr4fd_int_quantity"/>' +
        '<attribute name="cr4fd_fk_product"/>' +
		'<order attribute="cr4fd_name" descending="false"/>' +
		'<filter type="and">' +
            '<condition attribute="cr4fd_fk_inventory" operator="eq" uitype="cr4fd_inventory" value="' + inventoryId + '" />' +
        '</filter>' +
		'<link-entity name="cr4fd_product" from="cr4fd_productid" to="cr4fd_fk_product" link-type="inner" alias="af">'+
			'<link-entity name="cr4fd_price_list_items" from="cr4fd_fk_product" to="cr4fd_productid" link-type="inner" alias="ak" >'+
				'<attribute name="cr4fd_mon_price"/>' +
				'<attribute name="cr4fd_fk_price_list"/>' +
			'</link-entity>'+
		'</link-entity>'+
        '</entity>' +
        '</fetch>';
    fetchXml = "?fetchXml=" + encodeURIComponent(fetchXml);

    try {
        const inventoryLinesArray = await Xrm.WebApi.retrieveMultipleRecords('cr4fd_inventory_product', fetchXml);
        const inventoryLinesQuantity = inventoryLinesArray.entities.length;
        const priceListId  = formContext.getAttribute("cr4fd_fk_price_list").getValue()[0]?.id;;
		let totalPrice = 0, quantity=0, price=0, line;
        for(let i=0; i < inventoryLinesQuantity; i++) {
			line = inventoryLinesArray.entities[i];
			if(line["ak.cr4fd_fk_price_list"] === priceListId.replace("{","").replace("}","").toLowerCase()){
				quantity=line["cr4fd_int_quantity"];
				price=line["ak.cr4fd_mon_price"];
				totalPrice += quantity*price;
			}
		}
		formContext.getAttribute("cr4fd_mon_total_amount").setValue(totalPrice);
        }
    catch (error) {
        console.error("Error calculating total price of inventory:", error);
    }
}




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
    try {
        const result = await Xrm.WebApi.retrieveMultipleRecords("transactioncurrency", `?fetchXml=${encodeURIComponent(fetchXml)}`);
        let exchangeRates = {};
        result.entities.forEach(currency => {
            exchangeRates[currency.transactioncurrencyid] = parseFloat(currency.exchangerate);
        });
        const relativeExchangeRate = exchangeRates[priceListCurrencyId] / exchangeRates[productCurrencyId];
        return relativeExchangeRate;
    } catch (err) {
        console.error("Error: " + err.message);
    }
}








// Calculate total products amount in work order form
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
    
    try {
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
    } catch (error) {
        console.error("Error while retrieving product sum:", error);
    }

    try {
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
    } catch (error) {
        console.error("Error while retrieving services sum:", error);
    }
}


// get exchange rate with base currency
async function getExchangeRate(currencyId) {
    try {
        const result = await Xrm.WebApi.retrieveRecord("transactioncurrency", currencyId, "?$select=exchangerate");
        return parseFloat(result.exchangerate);
    } catch (error) {
        console.error("Error retrieving exchange rate: ", error);
        return 0; // Fallback to 1 if something goes wrong (no conversion)
    }
}
