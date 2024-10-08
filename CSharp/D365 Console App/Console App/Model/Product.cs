using Microsoft.Xrm.Sdk;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace D365.Model
{
    class Product : Entity
    {
        public const string EntityLogicalName = "cr4fd_product";

        public string productName { get; set; }
        public Guid productId { get; set; }

        public OptionSetValue type { get; set; }

        public Money cost { get; set; }
        public Money defaultPrice { get; set; }
        public Guid currencyId
        {
            get { return GetAttributeValue<EntityReference>("transactioncurrencyid")?.Id ?? Guid.Empty; }
            set { SetAttributeValue("transactioncurrencyid", new EntityReference("transactioncurrencyid", value)); }
        }
        public Product() : base(EntityLogicalName) { }
        public Product(Guid id, string name) : base(EntityLogicalName)
        {
            this.productId = id;
            this.productName = name;
            
        }
    }
}
