package main

import (
	"github.com/gin-gonic/gin"
	"server/cmd/controllers"
	"server/initializers"
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

	// 1. Управление таблицами
	r.POST("/api/tables", controllers.CreateTable)
	r.GET("/api/tables", controllers.ListTables)
	r.DELETE("/api/tables/:name", controllers.DropTable)
	r.PUT("/api/tables/:name/columns", controllers.AlterTable)

	r.POST("/api/queries/save", controllers.SaveQuery)
	r.GET("/api/queries/history", controllers.GetQueryHistory)

	// 2. Резервные копии
	r.POST("/api/backup", controllers.BackupDB)
	r.POST("/api/restore", controllers.RestoreDB)

	// 3. Управление запросами
	r.POST("/api/queries", controllers.SaveQuery)
	r.GET("/api/queries", controllers.ListQueries)
	r.POST("/api/queries/execute", controllers.ExecuteQuery)
	r.DELETE("/api/queries/:id", controllers.DeleteQuery)

	// 4. Экспорт данных
	r.GET("/api/export/:table", controllers.ExportTable)
	r.POST("/api/export/query", controllers.ExportQueryResults)

	r.Run(":8081")
}
