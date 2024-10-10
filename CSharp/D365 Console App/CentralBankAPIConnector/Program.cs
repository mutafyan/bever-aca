using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace CentralBankAPIConnector
{
    // Get Today's Exchange Rate of USD from CBA
    class Program
    {
        static void Main(string[] args)
        {
            CentralBankAPI.GateSoapClient soapClient = new CentralBankAPI.GateSoapClient();
            DateTime date = DateTime.Today;
            CentralBankAPI.ExchangeRates rates = soapClient.ExchangeRatesByDate(date);
            CentralBankAPI.ExchangeRate usdRate = rates.Rates.First(rate => rate.ISO == "USD");
            Console.WriteLine($"One {usdRate.ISO} equals {usdRate.Rate} AMD today");
            Console.ReadKey();
        }
    }
}
