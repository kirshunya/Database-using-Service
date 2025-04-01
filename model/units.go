package model

import (
	"time"
)

// Production (Производство)
type Production struct {
	ProductionID      uint      `gorm:"primaryKey" json:"production_id"`
	Products          []Product `gorm:"foreignKey:ProductionID" json:"products"` // 1-ко-многим с Товаром
	EmployeeID        uint      `json:"employee_id"`
	Employee          *Employee `gorm:"foreignKey:EmployeeID" json:"employee"` // 1-ко-многим с Сотрудником
	DefectiveQuantity uint      `json:"defective_quantity"`
	FactoryAddress    string    `json:"factory_address"`
}

// Product (Товар)
type Product struct {
	ProductID    uint       `gorm:"primaryKey" json:"product_id"`
	ProductionID uint       `json:"production_id"`
	DeliveryID   uint       `json:"delivery_id"`
	Delivery     *Delivery  `gorm:"foreignKey:DeliveryID" json:"delivery"`         // многие-к-одному с Доставкой
	Materials    []Material `gorm:"many2many:product_materials;" json:"materials"` // многие-ко-многим с Материалами
	BatchNumber  uint       `json:"batch_number"`
	ProductType  string     `json:"product_type"`
	CostPrice    float64    `json:"cost_price"`
	Name         string     `json:"product_name"`
}

// Material (Расходный материал)
type Material struct {
	MaterialID        uint      `gorm:"primaryKey" json:"material_id"`
	Products          []Product `gorm:"many2many:product_materials;" json:"products"`
	Price             float64   `json:"price"`
	Type              string    `json:"type"`
	Quantity          uint      `json:"quantity"`
	StorageDepartment string    `json:"storage_department"`
}

// Employee (Сотрудник)
type Employee struct {
	EmployeeID  uint         `gorm:"primaryKey" json:"employee_id"`
	Productions []Production `gorm:"foreignKey:EmployeeID" json:"productions"` // 1-ко-многим с Производством
	Transport   *Transport   `gorm:"foreignKey:EmployeeID" json:"transport"`   // 1-к-1 с Транспортом
	Deliveries  []Delivery   `gorm:"foreignKey:EmployeeID" json:"deliveries"`  // 1-ко-многим с Доставками
	FullName    string       `json:"full_name"`
	Position    string       `json:"position"`
	Salary      float64      `json:"salary"`
	PhoneNumber string       `json:"phone_number"`
}

// Transport (Транспорт)
type Transport struct {
	TransportID     uint       `gorm:"primaryKey" json:"transport_id"`
	EmployeeID      uint       `json:"employee_id"`                              // 1-к-1 с Сотрудником
	Deliveries      []Delivery `gorm:"foreignKey:TransportID" json:"deliveries"` // 1-ко-многим с Доставками
	Brand           string     `json:"brand"`
	Year            uint       `json:"year"`
	MaintenanceDate time.Time  `json:"maintenance_date"`
	FuelType        string     `json:"fuel_type"`
	IssueYear       uint       `json:"issue_year"`
}

// Delivery (Доставка)
type Delivery struct {
	DeliveryID   uint        `gorm:"primaryKey" json:"delivery_id"`
	Products     []Product   `gorm:"foreignKey:DeliveryID" json:"products"` // 1-ко-многим с Товарами
	TransportID  uint        `json:"transport_id"`
	Transport    *Transport  `gorm:"foreignKey:TransportID" json:"transport"` // многие-к-одному с Транспортом
	EmployeeID   uint        `json:"employee_id"`
	Employee     *Employee   `gorm:"foreignKey:EmployeeID" json:"employee"` // многие-к-одному с Сотрудником
	SalesPointID uint        `json:"sales_point_id"`
	SalesPoint   *SalesPoint `gorm:"foreignKey:SalesPointID" json:"sales_point"` // многие-к-одному с Местом продажи
	Amount       float64     `json:"amount"`
	Address      string      `json:"address"`
	Quantity     uint        `json:"quantity"`
	DeliveryDate time.Time   `json:"delivery_date"`
}

// SalesPoint (Место продажи)
type SalesPoint struct {
	SalesPointID  uint       `gorm:"primaryKey" json:"sales_point_id"`
	Deliveries    []Delivery `gorm:"foreignKey:SalesPointID" json:"deliveries"` // 1-ко-многим с Доставками
	ClientType    string     `json:"client_type"`
	ShippingTime  time.Time  `json:"shipping_time"`
	RecipientName string     `json:"recipient_name"`
	Address       string     `json:"address"`
}
