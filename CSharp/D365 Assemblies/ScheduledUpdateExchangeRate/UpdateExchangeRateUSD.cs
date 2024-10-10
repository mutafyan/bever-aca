using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Microsoft.Xrm.Sdk.Workflow;
using System;
using System.Activities;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using System.Xml;

namespace ScheduledUpdateExchangeRate
{
    // A CWA That should be scheduled to retrieve and update new exchange rates every day from Central Bank
    public class UpdateExchangeRateUSD : CodeActivity
    {
        protected override void Execute(CodeActivityContext executionContext)
        {
            ITracingService tracingService = executionContext.GetExtension<ITracingService>();
            IWorkflowContext context = executionContext.GetExtension<IWorkflowContext>();
            IOrganizationServiceFactory serviceFactory = executionContext.GetExtension<IOrganizationServiceFactory>();
            IOrganizationService service = serviceFactory.CreateOrganizationService(context.UserId);
            // Guid of USD
            Guid usdGuid = new Guid("8DB5749D-6573-EF11-A670-6045BDF2D3C9");
            try
            {
                HttpWebRequest webRequest = (HttpWebRequest)WebRequest.Create("http://api.cba.am/exchangerates.asmx");
                webRequest.ContentType = "text/xml; charset=utf-8";
                webRequest.Accept = "text/xml";
                webRequest.Method = "POST";
                webRequest.Headers.Add("SOAPAction", "http://www.cba.am/ExchangeRatesByDate");
                webRequest.KeepAlive = false;
                string todayDate = DateTime.Now.ToString("yyyy-MM-dd");
                string soapXml = $@"<?xml version='1.0' encoding='utf-8'?>
                    <soap:Envelope xmlns:xsi='http://www.w3.org/2001/XMLSchema-instance' xmlns:xsd='http://www.w3.org/2001/XMLSchema' xmlns:soap='http://schemas.xmlsoap.org/soap/envelope/'>
                        <soap:Body>
                            <ExchangeRatesByDate xmlns='http://www.cba.am/'>
                                <date>{todayDate}</date>
                            </ExchangeRatesByDate>
                        </soap:Body>
                    </soap:Envelope>";

                XmlDocument requestXml = new XmlDocument();
                requestXml.LoadXml(soapXml);

                Stream stream = webRequest.GetRequestStream();
                requestXml.Save(stream);

                WebResponse response = webRequest.GetResponse();

                XmlDocument responseXml = new XmlDocument();
                responseXml.Load(response.GetResponseStream());

                XmlNamespaceManager namespMgr = new XmlNamespaceManager(responseXml.NameTable);
                namespMgr.AddNamespace("soap", "http://schemas.xmlsoap.org/soap/envelope/");
                namespMgr.AddNamespace("cba", "http://www.cba.am/");

                XmlNodeList ratesNodes = responseXml.SelectNodes("//cba:ExchangeRate", namespMgr);
                foreach (XmlNode rateNode in ratesNodes)
                {
                    if (rateNode["ISO"] != null && rateNode["Rate"] != null)
                    {
                        string iso = rateNode["ISO"].InnerText;

                        if (iso == "USD" && decimal.TryParse(rateNode["Rate"].InnerText, out decimal rate) && rate != 0)
                        {
                            rate = 1 / rate;
                            tracingService.Trace($"Exchange rate AMD to USD: {rate}");
                            SetRateUSD(tracingService, service, usdGuid, rate);
                        }
                    }
                }
                
            }
            catch (Exception ex)
            {
                throw new InvalidPluginExecutionException($"An error occured in UpdateExchangeRateUSD: {ex.Message}");
            }
        }

        private static void SetRateUSD(ITracingService tracingService, IOrganizationService service, Guid usdGuid, decimal rate)
        {
            Entity usdCurrency = service.Retrieve("transactioncurrency", usdGuid, new ColumnSet("exchangerate"));
            if (usdCurrency == null) return;
            usdCurrency["exchangerate"] = rate;
            service.Update(usdCurrency);
        }
    }
}