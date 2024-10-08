using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;

namespace WorkOrderManagement
{
    /*
     * A plugin that works on Resource Create and Update steps
     * Checks the selected time period for conflicts with 
     * already existing bookings
     */
    public class RestrictConflictingBookings : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            IPluginExecutionContext context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            IOrganizationServiceFactory serviceFactory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            IOrganizationService service = serviceFactory.CreateOrganizationService(context.UserId);
            ITracingService tracingService = (ITracingService)serviceProvider.GetService(typeof(ITracingService));

            if (context.InputParameters.Contains("Target") && context.InputParameters["Target"] is Entity)
            {
                Entity booking = (Entity)context.InputParameters["Target"];

                try
                {
                    // Merge Target and Existing Booking to get all necessary fields
                    Entity mergedBooking = GetMergedBooking(context, booking, service, tracingService); 
                    Guid workOrderId = TryGetEntityReferenceId(mergedBooking, "cr4fd_fk_work_order", "Work Order", tracingService);
                    Guid resourceId = TryGetEntityReferenceId(mergedBooking, "cr4fd_fk_resource", "Resource", tracingService);
                    DateTime startDate = TryGetAttributeValue<DateTime>(mergedBooking, "cr4fd_dt_start_date", "Start Date", tracingService);
                    DateTime endDate = TryGetAttributeValue<DateTime>(mergedBooking, "cr4fd_dt_end_date", "End Date", tracingService);

                    if (startDate >= endDate)
                    {
                        throw new InvalidPluginExecutionException("The start date must be earlier than the end date.");
                        return;
                    }
                    QueryExpression query = new QueryExpression("cr4fd_booking")
                    {
                        ColumnSet = new ColumnSet(false),
                    };
                    query.Criteria.AddCondition("cr4fd_fk_resource", ConditionOperator.Equal, resourceId);
                    query.Criteria.AddCondition("cr4fd_fk_work_order", ConditionOperator.Equal, workOrderId);

                    // Exclude the current booking record on update
                    if (context.MessageName == "Update" && booking.Id != Guid.Empty)
                    {
                        query.Criteria.AddCondition("cr4fd_bookingid", ConditionOperator.NotEqual, booking.Id);
                    }

                    // Overlapping condition
                    query.Criteria.AddCondition("cr4fd_dt_start_date", ConditionOperator.LessThan, endDate);
                    query.Criteria.AddCondition("cr4fd_dt_end_date", ConditionOperator.GreaterThan, startDate);

                    EntityCollection overlappingBookings = service.RetrieveMultiple(query);
                    if (overlappingBookings.Entities.Count > 0)
                    {
                        // Conflict detected
                        throw new InvalidPluginExecutionException("The resource is already booked during the selected time.");
                    }
                }
                catch (InvalidPluginExecutionException ex)
                {
                    tracingService.Trace($"Resource booking conflict: {ex.Message}");
                    throw;
                }
                catch (Exception ex)
                {
                    tracingService.Trace($"An error occurred: {ex.Message}", ex);
                    throw new InvalidPluginExecutionException($"An error occurred in RestrictConflictingBookings plugin: {ex.Message}");
                }
            }
        }

        private Entity GetMergedBooking(IPluginExecutionContext context, Entity booking, IOrganizationService service, ITracingService tracingService)
        {
            Entity mergedBooking = new Entity("cr4fd_booking");
            mergedBooking.Id = booking.Id;
            foreach (var attribute in booking.Attributes)
            {
                mergedBooking[attribute.Key] = attribute.Value;
            }

            // If Update message, retrieve existing record to get other attributes
            if (context.MessageName == "Update" && booking.Id != Guid.Empty)
            {
                ColumnSet columns = new ColumnSet("cr4fd_fk_work_order", "cr4fd_fk_resource", "cr4fd_dt_start_date", "cr4fd_dt_end_date");
                Entity existingBooking = service.Retrieve("cr4fd_booking", booking.Id, columns);

                // Merge attributes from retrieved existing booking
                // if not present in Target (not updated attributes)
                foreach (var attribute in columns.Columns)
                {
                    if (!mergedBooking.Attributes.Contains(attribute) && existingBooking.Attributes.Contains(attribute))
                    {
                        mergedBooking[attribute] = existingBooking[attribute];
                    }
                }
            }

            return mergedBooking;
        }

        // If not available, throw exception to require the field
        private Guid TryGetEntityReferenceId(Entity entity, string attributeName, string displayName, ITracingService tracingService)
        {
            if (entity.Contains(attributeName) && entity[attributeName] is EntityReference reference)
            {
                return reference.Id;
            } else {
                throw new InvalidPluginExecutionException($"{displayName} is required.");
            }
        }

        // If not available, throw exception to require the field
        private T TryGetAttributeValue<T>(Entity entity, string attributeName, string displayName, ITracingService tracingService)
        {
            if (entity.Contains(attributeName) && entity[attributeName] is T value)
            {
                return value;
            }
            else
            {
                throw new InvalidPluginExecutionException($"{displayName} is required.");
            }
        }
    }
}
