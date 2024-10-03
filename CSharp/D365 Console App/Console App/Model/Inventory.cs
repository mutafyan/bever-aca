using Microsoft.Xrm.Sdk;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace D365.Model
{
    class Inventory : Entity
    {
        public const string EntityLogicalName = "cr4fd_inventory";

        public string inventoryName { get; set; }
        public Guid inventoryId { get; set; }
        public Guid priceListId
        {
            get { return GetAttributeValue<EntityReference>("cr4fd_fk_price_list")?.Id ?? Guid.Empty; }
            set { SetAttributeValue("cr4fd_fk_price_list", new EntityReference("cr4fd_fk_price_list", value)); }
        }
        public Inventory() : base(EntityLogicalName) { }
        public Inventory(Guid id, string name, Guid priceListId) : base(EntityLogicalName)
        {
            this.inventoryId = id;
            this.inventoryName = name;
            this.priceListId = priceListId;
        }
    }
}
