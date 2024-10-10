/**
 * Works on ribbon button click
 * Calculates total price of inventory
 * using inventory products
 */

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

