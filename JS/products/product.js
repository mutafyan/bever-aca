// Change displayed fields based on selected type (service/product)
function hideBasedOnType (executionContext) {
	const Form = executionContext.getFormContext();
	const option = Form.getAttribute("cr4fd_os_type").getText();
	if(option && option === "Service") {
		Form.getControl("cr4fd_mon_unit_price").setVisible(false);
		Form.getControl("cr4fd_mon_price_per_hour").setVisible(true);		
	} else {
		Form.getControl("cr4fd_mon_price_per_hour").setVisible(false);		
		Form.getControl("cr4fd_mon_unit_price").setVisible(true);
	}
}