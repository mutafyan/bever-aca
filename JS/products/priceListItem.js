// set price list item name to product name from lookup
function autofillName(executionContext) {
	const Form = executionContext.getFormContext();
	if(Form.ui.getFormType() === 1) {
		return;
	}
	const productName = Form.getAttribute("cr4fd_fk_product")?.getValue()[0]?.name;
	Form.getAttribute("cr4fd_name").setValue(productName);
}