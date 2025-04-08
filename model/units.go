package model

import (
	"database/sql/driver"
	"encoding/json"
	"gorm.io/gorm"
	"time"
)

type ColumnsArray []string

// Реализуем интерфейсы для работы с JSONB
func (a *ColumnsArray) Scan(value interface{}) error {
	return json.Unmarshal(value.([]byte), a)
}

func (a ColumnsArray) Value() (driver.Value, error) {
	return json.Marshal(a)
}

type TableMeta struct {
	ID        uint   `gorm:"primaryKey"`
	Name      string `gorm:"uniqueIndex;size:255;not null"`
	Columns   string `gorm:"type:text;not null"` // Сохраняем как JSON строку
	CreatedAt time.Time
	UpdatedAt time.Time
}

// Преобразуем колонки в JSON перед сохранением
func (t *TableMeta) BeforeSave(tx *gorm.DB) (err error) {
	if t.Columns == "" {
		t.Columns = "[]"
	}
	return
}

type SavedQuery struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Query     string    `gorm:"type:text;not null" json:"query"`
	Name      string    `gorm:"type:varchar(255)" json:"name"`
	LastUsed  time.Time `gorm:"not null" json:"lastUsed"`
	UseCount  int       `gorm:"default:1" json:"useCount"`
	CreatedAt time.Time `json:"createdAt"`
}
type Employee struct {
	EmployeeID  int     `gorm:"column:employee_id;primaryKey"`
	FullName    string  `gorm:"column:full_name"`
	Position    string  `gorm:"column:position"`
	Salary      float64 `gorm:"column:salary"`
	PhoneNumber string  `gorm:"column:phone_number"`
}

type Production struct {
	ProductionID      int       `gorm:"column:production_id;primaryKey"`
	ProductionDate    time.Time `gorm:"column:production_date"`
	EmployeeID        int       `gorm:"column:employes_id"` // Вот тут ОШИБКА в твоей БД (employes вместо employees)
	DefectiveQuantity int       `gorm:"column:defective_quantity"`
	FactoryAddress    string    `gorm:"column:factory_address"`
}

type Delivery struct {
	DeliveryID   int       `gorm:"column:delivery_id;primaryKey"`
	Amount       float64   `gorm:"column:amount"`
	Address      string    `gorm:"column:address"`
	Quantity     int       `gorm:"column:quantity"`
	ProductType  string    `gorm:"column:product_type"`
	DeliveryDate time.Time `gorm:"column:delivery_date"`
	EmployeeID   int       `gorm:"column:employes_id"` // Тут та же ошибка
	TransportID  int       `gorm:"column:transport_id"`
	SalesPointID int       `gorm:"column:sales_point_id"`
}

type Transport struct {
	TransportID     int       `gorm:"column:transport_id;primaryKey"`
	Brand           string    `gorm:"column:brand"`
	Year            int       `gorm:"column:year"`
	MaintenanceDate time.Time `gorm:"column:maintenance_date"`
	FuelType        string    `gorm:"column:fuel_type"`
	YearOfIssue     int       `gorm:"column:year_of_future"` // Тут странное название в БД
	EmployeeID      int       `gorm:"column:employee_id"`
}

type SalesPoint struct {
	SalesPointID  int       `gorm:"column:sales_point_id;primaryKey"`
	ClientType    string    `gorm:"column:client_type"`
	ShippingTime  time.Time `gorm:"column:shipping_time"`
	RecipientName string    `gorm:"column:recipient_name"`
	Address       string    `gorm:"column:address"`
}

type Product struct {
	ProductID   int     `gorm:"column:product_id;primaryKey"`
	BatchNumber string  `gorm:"column:batch_number"`
	ProductType string  `gorm:"column:product_type"`
	CostPrice   float64 `gorm:"column:cost_price"`
	Name        string  `gorm:"column:name"`
}

type Material struct {
	MaterialID        int     `gorm:"column:material_id;primaryKey"`
	Price             float64 `gorm:"column:price"`
	Type              string  `gorm:"column:type"`
	Quantity          int     `gorm:"column:quantity"`
	StorageDepartment string  `gorm:"column:storage_department"`
}

type ProductDelivery struct {
	ProductID  int `gorm:"column:product_id"`
	DeliveryID int `gorm:"column:delivery_id"`
}

type ProductMaterial struct {
	ProductID  int `gorm:"column:product_id"`
	MaterialID int `gorm:"column:material_id"`
}
