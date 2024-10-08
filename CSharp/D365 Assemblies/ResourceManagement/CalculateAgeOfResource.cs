using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Workflow;
using System;
using System.Activities;


namespace ResourceManagement
{
    // CWA that calculates age of a resource.
    // in->birth date (datetime)
    // out->age (int)
    public class CalculateAgeOfResource : CodeActivity
    {
        
        [Input("birthDate")]
        [AttributeTarget("cr4fd_resource", "cr4fd_dt_birth_date")]
        public InArgument<DateTime> BirthDate { get; set; }

        [Output("age")]
        [AttributeTarget("cr4fd_resource", "cr4fd_int_age")]
        public OutArgument<int> Age { get; set; }

        protected override void Execute(CodeActivityContext executionContext)
        {
            ITracingService tracingService = executionContext.GetExtension<ITracingService>();
            IWorkflowContext context = executionContext.GetExtension<IWorkflowContext>();
            IOrganizationServiceFactory serviceFactory = executionContext.GetExtension<IOrganizationServiceFactory>();
            IOrganizationService service = serviceFactory.CreateOrganizationService(context.UserId);

            try
            {
                DateTime today = DateTime.Today;
                DateTime birthDate = BirthDate.Get(executionContext);
                tracingService.Trace($"Comparing {today:G} and {birthDate:G}");
                int age = today.Year - birthDate.Year;
                // Check if the birthday has not occurred yet this year.
                if (birthDate > today.AddYears(-age))
                {
                    age--;
                }
                Age.Set(executionContext, age);
            }
            catch (Exception ex)
            {
                throw new InvalidPluginExecutionException(ex.Message);
            }
        }
    }
}
