function changeName (executionContext) {
	const Form = executionContext.getFormContext();
	let name = "";
	const lookup = Form.getAttribute("cr4fd_fk_product").getValue();
	if(lookup) {
		name = lookup[0]?.name;
	}
	Form.getAttribute("cr4fd_name").setValue(name);
}


function hideBasedOnType (executionContext) {
	const Form = executionContext.getFormContext();
	const option = Form.getAttribute("cr4fd_os_type").getSelectedOption().text;
	if(option && option === "Service") {
		Form.getControl("cr4fd_mon_unit_price").setVisible(false);	
	} else {
		Form.getControl("cr4fd_mon_unit_price").setVisible(true);
	}
	
}

function totalAmount(executionContext) {
	const Form = executionContext.getFormContext();
	const pricePerUnit = Form.getAttribute("cr4fd_mon_price_per_unit").getValue();
	const quantity = Form.getAttribute("cr4fd_int_quantity").getValue();
	Form.getAttribute("cr4fd_mon_total_amount").setValue(pricePerUnit*quantity);
}

function toggleFieldsBasedOnFormType(executionContext) {
	const Form = executionContext.getFormContext();
    let formType = Form.ui.getFormType();
    if(formType === 2) {
    	Form.getControl("cr4fd_fk_product").setDisabled(true);
    	Form.getControl("cr4fd_fk_inventory").setDisabled(true);	
    	Form.getControl("cr4fd_int_quantity").setDisabled(true);		
    	Form.getControl("cr4fd_mon_price_per_unit").setDisabled(true);	
    } else if (formType === 1) {
    	Form.getControl("cr4fd_fk_product").setDisabled(false);
    	Form.getControl("cr4fd_fk_inventory").setDisabled(false);	
    	Form.getControl("cr4fd_int_quantity").setDisabled(false);		
    	Form.getControl("cr4fd_mon_price_per_unit").setDisabled(false);	
    } else {
    	// pass
    }
    
}



async function calculateTotalPriceOfInventory (executionContext) {
	const Form = executionContext.getFormContext();
	const recordId = Form.data.entity.getId();
	let fetchXml = '<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">'+
	'<entity name="cr4fd_inventory_product">'+
	'<attribute name="cr4fd_inventory_productid"/>'+
	'<attribute name="cr4fd_name"/>'+
	'<attribute name="cr4fd_name"/>'+
	'<attribute name="cr4fd_name"/>'+

	'<attribute name="createdon"/>'+
	'<order attribute="cr4fd_name" descending="false"/>'+
	'</entity>'+
	'</fetch>'
}