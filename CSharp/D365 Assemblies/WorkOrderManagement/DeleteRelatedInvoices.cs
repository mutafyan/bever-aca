using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Workflow;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.Activities;

namespace WorkOrderManagement
{
    public class DeleteRelatedInvoices : CodeActivity
    {
        [Input("WorkOrderReference")]
        [ReferenceTarget("cr4fd_work_order")]
        public InArgument<EntityReference> WorkOrderReference { get; set; }

        protected override void Execute(CodeActivityContext executionContext)
        {
            ITracingService tracingService = executionContext.GetExtension<ITracingService>();
            IWorkflowContext context = executionContext.GetExtension<IWorkflowContext>();
            IOrganizationServiceFactory serviceFactory = executionContext.GetExtension<IOrganizationServiceFactory>();
            IOrganizationService service = serviceFactory.CreateOrganizationService(context.UserId);

            EntityReference workOrderRef = WorkOrderReference.Get(executionContext);
            if (workOrderRef == null)
                return;

            try
            {
                DeleteRelatedInvoicesAndLines(service, tracingService, workOrderRef);
            }
            catch (Exception ex)
            {
                tracingService.Trace("An error occurred: {0}", ex.Message);
                throw new InvalidPluginExecutionException("An error occurred in DeleteRelatedInvoicesOnStateChange workflow activity: " + ex.Message, ex);
            }
        }

        private void DeleteRelatedInvoicesAndLines(IOrganizationService service, ITracingService tracingService, EntityReference workOrderRef)
        {
            EntityCollection relatedInvoices = RetrieveRelatedInvoices(service, workOrderRef);

            if (relatedInvoices.Entities.Count == 0)
            {
                tracingService.Trace("No related invoices found for Work Order ID: {0}. Exiting workflow.", workOrderRef.Id);
                return;
            }


            foreach (Entity invoice in relatedInvoices.Entities)
            {
                DeleteInvoiceAndLines(service, tracingService, invoice);
            }
        }

        private EntityCollection RetrieveRelatedInvoices(IOrganizationService service, EntityReference workOrderRef)
        {
            QueryExpression invoiceQuery = new QueryExpression("cr4fd_invoice")
            {
                ColumnSet = new ColumnSet("cr4fd_invoiceid"),
                Criteria = new FilterExpression
                {
                    Conditions =
                    {
                        new ConditionExpression("cr4fd_fk_work_order", ConditionOperator.Equal, workOrderRef.Id)
                    }
                }
            };

            return service.RetrieveMultiple(invoiceQuery);
        }

        private void DeleteInvoiceAndLines(IOrganizationService service, ITracingService tracingService, Entity invoice)
        {
            Guid invoiceId = invoice.Id;

            EntityCollection relatedInvoiceLines = RetrieveRelatedInvoiceLines(service, invoiceId);

            foreach (Entity invoiceLine in relatedInvoiceLines.Entities)
            {
                service.Delete("cr4fd_invoice_line", invoiceLine.Id);
                tracingService.Trace("Deleted Invoice Line ID: {0}", invoiceLine.Id);
            }

            service.Delete("cr4fd_invoice", invoiceId);
            tracingService.Trace("Deleted Invoice ID: {0}", invoiceId);
        }

        private EntityCollection RetrieveRelatedInvoiceLines(IOrganizationService service, Guid invoiceId)
        {
            QueryExpression invoiceLineQuery = new QueryExpression("cr4fd_invoice_line")
            {
                ColumnSet = new ColumnSet("cr4fd_invoice_lineid"),
                Criteria = new FilterExpression
                {
                    Conditions =
                    {
                        new ConditionExpression("cr4fd_fk_invoice", ConditionOperator.Equal, invoiceId)
                    }
                }
            };

            return service.RetrieveMultiple(invoiceLineQuery);
        }
    }
}