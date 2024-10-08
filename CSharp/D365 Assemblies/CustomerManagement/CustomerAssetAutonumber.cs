using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;

namespace CustomerManagement
{
    // A plugin that generates an asset autonumber in the format {CompanyName}-0001.
    public class CustomerAssetAutonumber : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            IPluginExecutionContext context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            IOrganizationServiceFactory serviceFactory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            IOrganizationService service = serviceFactory.CreateOrganizationService(context.UserId);
            ITracingService tracingService = (ITracingService)serviceProvider.GetService(typeof(ITracingService));

            if (!IsValidContext(context))
            {
                return;
            }

            Entity targetEntity = (Entity)context.InputParameters["Target"];

            try
            {
                if (ShouldGenerateNewAssetName(context, targetEntity))
                {
                    GenerateAssetName(service, targetEntity);
                }
            }
            catch (Exception ex)
            {
                tracingService.Trace($"An error occurred: {ex.Message}");
                throw new InvalidPluginExecutionException($"An error occurred in AutoNumberAssetPlugin: {ex.Message}", ex);
            }
        }

        private bool IsValidContext(IPluginExecutionContext context)
        {
            return (context.MessageName == "Create" || context.MessageName == "Update") && context.PrimaryEntityName == "cr4fd_customer_asset";
        }

        private bool ShouldGenerateNewAssetName(IPluginExecutionContext context, Entity targetEntity)
        {
            return context.MessageName == "Create" || (context.MessageName == "Update" && targetEntity.Contains("cr4fd_fk_my_account"));
        }

        private void GenerateAssetName(IOrganizationService service, Entity targetEntity)
        {
            EntityReference accountRef = targetEntity.GetAttributeValue<EntityReference>("cr4fd_fk_my_account");

            if (accountRef == null)
            {
                return;
            }

            Entity account = service.Retrieve(accountRef.LogicalName, accountRef.Id, new ColumnSet("cr4fd_name"));
            string accountName = account.GetAttributeValue<string>("cr4fd_name");

            if (string.IsNullOrEmpty(accountName))
            {
                return;
            }

            string shortName = accountName.Substring(0, Math.Min(3, accountName.Length)).ToUpper();
            int newCounter = GetNewAssetCounter(service);
            string newCounterStr = newCounter.ToString("D3");

            string assetName = $"{shortName}-{newCounterStr}";
            targetEntity["cr4fd_name"] = assetName;
        }

        private int GetNewAssetCounter(IOrganizationService service)
        {
            QueryExpression query = new QueryExpression("cr4fd_customer_asset")
            {
                ColumnSet = new ColumnSet("createdon"),
                Orders = { new OrderExpression("createdon", OrderType.Descending) }
            };

            EntityCollection customerAssets = service.RetrieveMultiple(query);
            return customerAssets.Entities.Count + 1;
        }
    }
}