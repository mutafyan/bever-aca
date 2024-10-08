using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace WorkOrderManagement
{
    // A plugin that autonumbers new work order product and work order service record names
    // using a pattern like WO-001-PROD-001 for products and WO-001-SER-001 for services
    public class AutoNumberWorkOrderItems : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            ITracingService tracingService = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            IPluginExecutionContext context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            IOrganizationServiceFactory serviceFactory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            IOrganizationService service = serviceFactory.CreateOrganizationService(context.UserId);

            try
            {
                if (context.MessageName != "Create" || !(context.InputParameters["Target"] is Entity targetEntity))
                    return;

                if (!IsTargetEntity(targetEntity.LogicalName))
                    return;


                if (!targetEntity.Contains("cr4fd_fk_work_order"))
                {
                    tracingService.Trace("Work Order reference is not set on the target entity.");
                    return;
                }

                EntityReference workOrderRef = targetEntity.GetAttributeValue<EntityReference>("cr4fd_fk_work_order");

                // Retrieve the Work Order entity to get its name
                string workOrderName = GetWorkOrderName(service, workOrderRef);
                if (string.IsNullOrEmpty(workOrderName))
                {
                    tracingService.Trace("Work Order name is null or empty.");
                    return;
                }

                // Determine the item type abbreviation
                string itemTypeAbbreviation = GetItemTypeAbbreviation(targetEntity.LogicalName);

                // Generate the next sequence number
                int nextNumber = GetNextSequenceNumber(service, workOrderRef.Id, targetEntity.LogicalName, workOrderName, itemTypeAbbreviation);

                string newName = $"{workOrderName}-{itemTypeAbbreviation}-{nextNumber:D3}";

                // Set the name
                targetEntity["cr4fd_name"] = newName;
                tracingService.Trace($"Assigned name: {newName}");
            }
            catch (Exception ex)
            {
                tracingService.Trace("Exception: ", ex.Message);
                throw new InvalidPluginExecutionException("An error occurred in AutoNumberWorkOrderItems plugin.", ex);
            }
        }

        private bool IsTargetEntity(string entityName)
        {
            return entityName == "cr4fd_work_order_product" || entityName == "cr4fd_workorderservice";
        }

        private string GetItemTypeAbbreviation(string entityName)
        {
            return entityName == "cr4fd_work_order_product" ? "PROD" : "SER";
        }

        private string GetWorkOrderName(IOrganizationService service, EntityReference workOrderRef)
        {
            Entity workOrder = service.Retrieve(workOrderRef.LogicalName, workOrderRef.Id, new ColumnSet("cr4fd_name"));
            return workOrder?.GetAttributeValue<string>("cr4fd_name");
        }

        private int GetNextSequenceNumber(IOrganizationService service, Guid workOrderId, string entityName, string workOrderName, string itemTypeAbbreviation)
        {
            string namePrefix = $"{workOrderName}-{itemTypeAbbreviation}-";

            // Query existing items with names starting with the prefix
            QueryExpression query = new QueryExpression(entityName)
            {
                ColumnSet = new ColumnSet("cr4fd_name"),
                Criteria = new FilterExpression
                {
                    Conditions =
                    {
                        new ConditionExpression("cr4fd_fk_work_order", ConditionOperator.Equal, workOrderId),
                        new ConditionExpression("cr4fd_name", ConditionOperator.BeginsWith, namePrefix)
                    }
                }
            };

            EntityCollection existingItems = service.RetrieveMultiple(query);

            int maxNumber = 0;

            foreach (Entity existingItem in existingItems.Entities)
            {
                string existingName = existingItem.GetAttributeValue<string>("cr4fd_name");
                if (!string.IsNullOrEmpty(existingName))
                {
                    // Extract the numeric part of the name
                    string numberPart = existingName.Substring(namePrefix.Length);
                    if (int.TryParse(numberPart, out int existingNumber))
                    {
                        if (existingNumber > maxNumber)
                        {
                            maxNumber = existingNumber;
                        }
                    }
                }
            }

            return maxNumber + 1;
        }
    }
}
