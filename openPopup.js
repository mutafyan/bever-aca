function openInventoryProductPopup(formContext) {
    const inventoryId = formContext.data.entity.getId();
    if(!inventoryId) {
        alert("NO ID")
    }
    
    console.log(inventoryId);
    let pageInput = 
    {
        pageType: "webresource",
        webresourceName: "cr4fd_html_inventory_product_popup",
        data: JSON.stringify({"inventoryId": inventoryId})
    };

    let navigationOptions = 
    {
        target: 2,
        width: 400,
        height: 600,
        position: 1
    };

    Xrm.Navigation.navigateTo(pageInput, navigationOptions).then(
        function success(){
            // success
        },
        function error(){
            // error
        }
    )
}
