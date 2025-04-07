package main

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"server/initializers"
	"server/model"
	"strings"
)

func init() {
	initializers.LoadEnv()
	initializers.ConnectEnv()
	//err := inits.DB.AutoMigrate(
	//	&model.Employee{}, // Должно быть ПЕРВЫМ
	//	&model.SalesPoint{},
	//	&model.Transport{},
	//	&model.Product{},
	//	&model.Material{},
	//	&model.Delivery{},
	//	&model.Production{}, // Создаётся после Employee
	//	&model.ProductDelivery{},
	//	&model.ProductMaterial{},
	//)
	//if err != nil {
	//	panic(err)
	//}
}

func main() {
	r := gin.Default()

	// CORS middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "*")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "*")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Роуты
	r.GET("/api/employees", getEmployees)
	r.POST("/api/query", execQuery)

	// Запуск
	r.Run(":8081")
}

func getEmployees(c *gin.Context) {
	var employees []model.Employee
	if err := initializers.DB.Find(&employees).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, employees)
}

func execQuery(c *gin.Context) {
	var req struct {
		Query string `json:"query" binding:"required"`
	}

	// Проверяем, что запрос не пустой
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ты че, запрос хуйню прислал?"})
		return
	}

	// Удаляем лишние кавычки и пробелы
	cleanQuery := strings.TrimSpace(req.Query)
	if cleanQuery == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Пустой запрос, бро"})
		return
	}

	// Запрещаем опасные запросы (опционально)
	if strings.Contains(strings.ToUpper(cleanQuery), "DROP") ||
		strings.Contains(strings.ToUpper(cleanQuery), "DELETE") {
		c.JSON(http.StatusForbidden, gin.H{"error": "Ты че, DELETE/DROP нельзя, пацан!"})
		return
	}

	// Выполняем запрос
	var result []map[string]interface{}
	tx := initializers.DB.Raw(cleanQuery).Scan(&result)

	if tx.Error != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":  "Ошибка в SQL:",
			"detail": tx.Error.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": result})
}
