package main

import (
	"github.com/gin-gonic/gin"
	"server/cmd/controllers"
	"server/initializers"
)

func init() {
	initializers.LoadEnv()
	initializers.ConnectEnv()
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
	// Управление таблицами
	r.POST("/api/tables", controllers.CreateTable)                        // Добавление колонки
	r.DELETE("/api/tables/:name/columns/:column", controllers.DropColumn) // Удаление колонки
	r.GET("/api/tables", controllers.ListTables)
	r.DELETE("/api/tables/:name", controllers.DropTable)               // Удаление таблицы
	r.PUT("/api/tables/:name/columns/:column", controllers.AlterTable) // Переименуем AlterTable в AlterColumn

	// 2. Резервные копии
	r.GET("/api/backup", controllers.BackupDB)
	r.POST("/api/restore", controllers.RestoreDB)

	r.POST("/api/tables/:name/restore", controllers.RestoreTable)
	r.GET("/api/tables/:name/backup", controllers.BackupTable)

	// 3. Управление запросами
	r.POST("/api/queries/save", controllers.SaveQuery)
	r.GET("/api/queries/history", controllers.GetQueryHistory)
	r.POST("/api/queries/execute", controllers.ExecuteQuery)
	r.DELETE("/api/queries/:id", controllers.DeleteQuery)

	// 4. Экспорт данных
	r.GET("/api/export/:table", controllers.ExportTable)
	r.POST("/api/export/query", controllers.ExportQueryResults)

	r.GET("/api/tables/:name/info", controllers.GetTableInfo)
	r.GET("/api/tables/:name/data", controllers.GetTableData)

	r.GET("/api/tables/:name/rows/:id/backup", controllers.BackupRow)
	r.POST("/api/tables/:name/rows/restore", controllers.RestoreRow)
	r.POST("/api/tables/:name/columns", controllers.AddColumn)

	r.POST("/api/tables/:name/rows", controllers.AddRow)
	r.PUT("/api/tables/:name/rows/:id", controllers.UpdateRow)
	r.DELETE("/api/tables/:name/rows/:id", controllers.DeleteRow)

	r.Run(":8081")
}
