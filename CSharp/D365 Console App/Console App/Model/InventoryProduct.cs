using Microsoft.Xrm.Sdk;
using System;

namespace D365.Model
{
    class InventoryProduct : Entity
    {
        public const string EntityLogicalName = "cr4fd_inventory_product";

        public Guid InventoryId
        {
            get { return GetAttributeValue<EntityReference>("cr4fd_fk_inventory")?.Id ?? Guid.Empty; }
            set { SetAttributeValue("cr4fd_fk_inventory", new EntityReference("cr4fd_inventory", value)); }
        }

        public Guid ProductId
        {
            get { return GetAttributeValue<EntityReference>("cr4fd_fk_product")?.Id ?? Guid.Empty; }
            set { SetAttributeValue("cr4fd_fk_product", new EntityReference("cr4fd_product", value)); }
        }

        public int Quantity
        {
            get { return GetAttributeValue<int>("cr4fd_int_quantity"); }
            set { SetAttributeValue("cr4fd_int_quantity", value); }
        }

        public InventoryProduct() : base(EntityLogicalName)
        {
        }

        public InventoryProduct(Guid inventoryId, Guid productId, int quantity)
            : base(EntityLogicalName)
        {
            this.InventoryId = inventoryId;
            this.ProductId = productId;
            this.Quantity = quantity;
        }

        public InventoryProduct(Guid Id, Guid inventoryId, Guid productId, int quantity)
            : base(EntityLogicalName)
        {
            this.Id = Id;
            this.InventoryId = inventoryId;
            this.ProductId = productId;
            this.Quantity = quantity;
        }
    }
}
