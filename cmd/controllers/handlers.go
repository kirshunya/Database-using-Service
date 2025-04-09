package controllers

import (
	"archive/zip"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"server/initializers"
	"server/model"
)

func isValidIdentifier(s string) bool {
	return regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`).MatchString(s)
}

// CreateTable создает новую таблицу
func CreateTable(c *gin.Context) {
	// 1. Определяем структуру для входящего запроса
	type Request struct {
		Name    string   `json:"name" binding:"required"`
		Columns []string `json:"columns" binding:"required,min=1,dive,required"`
	}

	// 2. Парсим входящий JSON
	var req Request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Неверный формат запроса",
			"details": err.Error(),
		})
		return
	}

	// 3. Валидация имени таблицы
	if !isValidIdentifier(req.Name) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":        "Некорректное имя таблицы",
			"requirements": "Должно начинаться с буквы и содержать только a-z, 0-9, _",
			"received":     req.Name,
		})
		return
	}

	// 4. Проверяем существование таблицы
	var tableExists bool
	if err := initializers.DB.Raw(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = ?
        )`, strings.ToLower(req.Name)).Scan(&tableExists).Error; err != nil {

		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Ошибка проверки существования таблицы",
			"details": err.Error(),
		})
		return
	}

	if tableExists {
		c.JSON(http.StatusConflict, gin.H{
			"error": fmt.Sprintf("Таблица '%s' уже существует", req.Name),
		})
		return
	}

	// 5. Обрабатываем колонки
	var columns []string
	var hasSerial bool
	columnNames := make(map[string]bool)
	validTypes := map[string]bool{
		"INTEGER": true, "SERIAL": true, "VARCHAR(255)": true,
		"TEXT": true, "BOOLEAN": true, "DATE": true,
		"TIMESTAMP": true, "FLOAT": true, "JSON": true, "UUID": true,
	}

	for i, col := range req.Columns {
		parts := strings.SplitN(col, ":", 2)
		if len(parts) != 2 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":    "Неверный формат колонки",
				"position": i + 1,
				"expected": "name:type",
				"example":  "price:FLOAT",
			})
			return
		}

		name, colType := parts[0], parts[1]

		// Проверка имени колонки
		if !isValidIdentifier(name) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":    "Некорректное имя колонки",
				"position": i + 1,
				"name":     name,
			})
			return
		}

		// Проверка на дубликаты
		if columnNames[name] {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":    "Дублирующееся имя колонки",
				"position": i + 1,
				"name":     name,
			})
			return
		}
		columnNames[name] = true

		// Проверка типа данных
		if !validTypes[colType] {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":    "Недопустимый тип данных",
				"position": i + 1,
				"type":     colType,
				"allowed":  getKeys(validTypes),
			})
			return
		}

		if colType == "SERIAL" {
			hasSerial = true
		}

		columns = append(columns, fmt.Sprintf("%s %s", name, colType))
	}

	// 6. Добавляем первичный ключ, если нет SERIAL
	if !hasSerial {
		columns = append(columns, "id SERIAL PRIMARY KEY")
	}

	// 7. Формируем SQL запрос
	sql := fmt.Sprintf("CREATE TABLE %s (\n  %s\n)", req.Name, strings.Join(columns, ",\n  "))

	// 8. Начинаем транзакцию
	tx := initializers.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// 9. Создаем таблицу
	if err := tx.Exec(sql).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Ошибка выполнения SQL",
			"details": err.Error(),
			"sql":     sql,
		})
		return
	}

	// 10. Сохраняем метаданные
	columnsJSON, err := json.Marshal(req.Columns)
	if err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Ошибка сериализации колонок",
			"details": err.Error(),
		})
		return
	}

	meta := model.TableMeta{
		Name:    req.Name,
		Columns: string(columnsJSON),
	}

	if err := tx.Create(&meta).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Ошибка сохранения метаданных",
			"details": err.Error(),
		})
		return
	}

	// 11. Фиксируем транзакцию
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Ошибка фиксации транзакции",
			"details": err.Error(),
		})
		return
	}

	// 12. Возвращаем успешный ответ
	c.JSON(http.StatusCreated, gin.H{
		"status":  "Таблица успешно создана",
		"table":   req.Name,
		"meta_id": meta.ID,
		"columns": columns,
	})
}

// Вспомогательные функции
//func isValidIdentifier(s string) bool {
//	return regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`).MatchString(s)
//}

func getKeys(m map[string]bool) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

// ListTables возвращает список таблиц
func ListTables(c *gin.Context) {
	var tables []string
	if err := initializers.DB.Raw(`
		SELECT table_name 
		FROM information_schema.tables 
		WHERE table_schema = 'public'
		ORDER BY table_name
	`).Scan(&tables).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка получения списка таблиц"})
		return
	}

	c.JSON(http.StatusOK, tables)
}

// GetTableInfo возвращает информацию о таблице
func GetTableInfo(c *gin.Context) {
	tableName := c.Param("name")

	var meta model.TableMeta
	if err := initializers.DB.Where("name = ?", tableName).First(&meta).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Метаданные таблицы не найдены"})
		return
	}

	// Получаем информацию о колонках из БД
	var columns []struct {
		ColumnName string `gorm:"column:column_name"`
		DataType   string `gorm:"column:data_type"`
	}

	if err := initializers.DB.Raw(`
		SELECT column_name, data_type
		FROM information_schema.columns
		WHERE table_name = ?
		ORDER BY ordinal_position
	`, tableName).Scan(&columns).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка получения информации о колонках"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"name":    meta.Name,
		"columns": columns,
	})
}

// DropTable удаляет таблицу
func DropTable(c *gin.Context) {
	tableName := c.Param("name")

	// Проверяем существование таблицы
	var exists bool
	if err := initializers.DB.Raw(`
		SELECT EXISTS (
			SELECT FROM information_schema.tables 
			WHERE table_name = ?
		)`, tableName).Scan(&exists).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка проверки таблицы"})
		return
	}

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Таблица не найдена"})
		return
	}

	// Удаляем в транзакции
	tx := initializers.DB.Begin()

	// Удаляем метаданные
	if err := tx.Where("name = ?", tableName).Delete(&model.TableMeta{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка удаления метаданных"})
		return
	}

	// Удаляем таблицу
	if err := tx.Exec(fmt.Sprintf("DROP TABLE %s", tableName)).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка удаления таблицы"})
		return
	}

	tx.Commit()

	c.JSON(http.StatusOK, gin.H{"status": "Таблица удалена"})
}

func BackupDB(c *gin.Context) {
	// Создаем временный файл
	backupFile := fmt.Sprintf("backup_%s.zip", time.Now().Format("20060102_150405"))
	zipFile, err := os.Create(backupFile)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось создать файл бэкапа"})
		return
	}
	defer os.Remove(backupFile)
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	// Получаем список таблиц
	var tables []string
	if err := initializers.DB.Raw(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
    `).Scan(&tables).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка получения списка таблиц"})
		return
	}

	// Экспортируем каждую таблицу
	for _, table := range tables {
		file, err := zipWriter.Create(table + ".csv")
		if err != nil {
			continue
		}

		if err := exportTableToWriter(table, file); err != nil {
			continue
		}
	}

	c.FileAttachment(backupFile, "db_backup.zip")
}

// RestoreDB восстанавливает базу из резервной копии
func RestoreDB(c *gin.Context) {
	file, err := c.FormFile("backup")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Файл не загружен"})
		return
	}

	// Сохраняем временный файл
	tempFile, err := os.CreateTemp("", "restore-*.zip")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка создания временного файла"})
		return
	}
	defer os.Remove(tempFile.Name())

	if err := c.SaveUploadedFile(file, tempFile.Name()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сохранения файла"})
		return
	}

	// Распаковываем архив
	zipReader, err := zip.OpenReader(tempFile.Name())
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат архива"})
		return
	}
	defer zipReader.Close()

	// Восстанавливаем в транзакции
	tx := initializers.DB.Begin()

	// Сначала восстанавливаем метаданные
	var metas []model.TableMeta
	for _, f := range zipReader.File {
		if f.Name == "_metadata.json" {
			rc, err := f.Open()
			if err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка чтения метаданных"})
				return
			}
			defer rc.Close()

			metaData, _ := io.ReadAll(rc)
			json.Unmarshal(metaData, &metas)
			break
		}
	}

	// Затем таблицы
	for _, f := range zipReader.File {
		if !strings.HasSuffix(f.Name, ".csv") || f.Name == "_metadata.json" {
			continue
		}

		tableName := strings.TrimSuffix(f.Name, ".csv")
		if err := restoreTableFromZip(tx, f, tableName); err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": fmt.Sprintf("Ошибка восстановления таблицы %s: %v", tableName, err),
			})
			return
		}
	}

	// Восстанавливаем метаданные
	if len(metas) > 0 {
		if err := tx.Where("1=1").Delete(&model.TableMeta{}).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка очистки старых метаданных"})
			return
		}

		for _, meta := range metas {
			if err := tx.Create(&meta).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": fmt.Sprintf("Ошибка сохранения метаданных для %s", meta.Name),
				})
				return
			}
		}
	}

	tx.Commit()
	c.JSON(http.StatusOK, gin.H{"status": "База восстановлена"})
}

// AlterTable изменяет структуру таблицы
func AlterTable(c *gin.Context) {
	var req struct {
		Action string `json:"action" binding:"required"` // "add" или "drop"
		Column string `json:"column" binding:"required"`
		Type   string `json:"type,omitempty"` // Только для action=add
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	table := c.Param("name")

	// Проверка существования таблицы
	var exists bool
	initializers.DB.Raw(`
		SELECT EXISTS (
			SELECT FROM information_schema.tables 
			WHERE table_name = ?
		)`, table).Scan(&exists)

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Таблица не найдена"})
		return
	}

	var sql string
	switch req.Action {
	case "add":
		if req.Type == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Не указан тип колонки"})
			return
		}
		sql = fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, req.Column, req.Type)
	case "drop":
		sql = fmt.Sprintf("ALTER TABLE %s DROP COLUMN %s", table, req.Column)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Недопустимое действие"})
		return
	}

	if err := initializers.DB.Exec(sql).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "Таблица изменена"})
}

func SaveQuery(c *gin.Context) {
	var req struct {
		Query string `json:"query" binding:"required"`
		Name  string `json:"name"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Проверяем существование запроса
	var query model.SavedQuery
	result := initializers.DB.Where("query = ?", req.Query).First(&query)

	if result.Error == gorm.ErrRecordNotFound {
		// Создаем новый запрос
		query = model.SavedQuery{
			Query:    req.Query,
			Name:     req.Name,
			LastUsed: time.Now(),
			UseCount: 1,
		}
		if err := initializers.DB.Create(&query).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		// Обновляем существующий
		query.LastUsed = time.Now()
		query.UseCount += 1
		if req.Name != "" {
			query.Name = req.Name
		}
		if err := initializers.DB.Save(&query).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	// Явно возвращаем все необходимые поля
	c.JSON(http.StatusOK, gin.H{
		"id":       query.ID, // Убедитесь, что это поле существует в модели
		"query":    query.Query,
		"name":     query.Name,
		"lastUsed": query.LastUsed,
		"useCount": query.UseCount,
	})
}

func ListQueries(c *gin.Context) {
	var queries []model.SavedQuery
	if err := initializers.DB.
		Order("last_used DESC").
		Find(&queries).
		Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, queries)
}

// ExecQuery выполняет SQL-запрос
func ExecuteQuery(c *gin.Context) {
	var req struct {
		Query string `json:"query" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 1. Сначала обновляем статистику
	var query model.SavedQuery
	result := initializers.DB.Where("query = ?", req.Query).First(&query)

	if result.Error == nil {
		// Запрос существует - обновляем статистику
		query.LastUsed = time.Now()
		query.UseCount += 1
		initializers.DB.Save(&query)
	}

	// 2. Затем выполняем запрос
	var results []map[string]interface{}
	if err := initializers.DB.Raw(req.Query).Scan(&results).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": results,
		"queryInfo": gin.H{
			"id":       query.ID,
			"useCount": query.UseCount,
			"lastUsed": query.LastUsed.Format(time.RFC3339),
		},
	})
}

// ExportTable экспортирует таблицу в CSV
func ExportTable(c *gin.Context) {
	table := c.Param("table")

	// Проверка существования таблицы
	var exists bool
	initializers.DB.Raw(`
		SELECT EXISTS (
			SELECT FROM information_schema.tables 
			WHERE table_name = ?
		)`, table).Scan(&exists)

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Таблица не найдена"})
		return
	}

	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s.csv", table))

	if err := exportTableToWriter(table, c.Writer); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}

// Для эндпоинта /api/queries/history
func GetQueryHistory(c *gin.Context) {
	var queries []model.SavedQuery
	if err := initializers.DB.Find(&queries).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Явно преобразуем в правильный формат
	var response []gin.H
	for _, q := range queries {
		response = append(response, gin.H{
			"id":       q.ID,
			"query":    q.Query,
			"name":     q.Name,
			"lastUsed": q.LastUsed.Format(time.RFC3339),
			"useCount": q.UseCount,
		})
	}

	c.JSON(http.StatusOK, response)
}

// Для эндпоинта удаления
func DeleteQuery(c *gin.Context) {
	id := c.Param("id")

	// Проверяем, что ID - число
	if _, err := strconv.Atoi(id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID format"})
		return
	}

	if err := initializers.DB.Delete(&model.SavedQuery{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// ExportQueryResults экспортирует результаты запроса
func ExportQueryResults(c *gin.Context) {
	var req struct {
		Query string `json:"query" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Проверка запроса
	if strings.Contains(strings.ToUpper(req.Query), "DROP") ||
		strings.Contains(strings.ToUpper(req.Query), "DELETE") {
		c.JSON(http.StatusForbidden, gin.H{"error": "Запрещенный запрос"})
		return
	}

	var results []map[string]interface{}
	if err := initializers.DB.Raw(req.Query).Scan(&results).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", "attachment; filename=query_results.csv")

	writer := csv.NewWriter(c.Writer)
	defer writer.Flush()

	if len(results) == 0 {
		writer.Write([]string{"Нет данных"})
		return
	}

	// Заголовки
	headers := make([]string, 0, len(results[0]))
	for k := range results[0] {
		headers = append(headers, k)
	}
	writer.Write(headers)

	// Данные
	for _, row := range results {
		values := make([]string, 0, len(headers))
		for _, h := range headers {
			val := row[h]
			if val == nil {
				values = append(values, "")
			} else {
				values = append(values, fmt.Sprintf("%v", val))
			}
		}
		writer.Write(values)
	}
}

// BackupTable создает резервную копию таблицы
func BackupTable(c *gin.Context) {
	tableName := c.Param("name")

	// Создаем временный файл
	backupFile := fmt.Sprintf("backup_%s_%s.csv", tableName, time.Now().Format("20060102_150405"))
	file, err := os.Create(backupFile)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось создать файл бэкапа"})
		return
	}
	defer os.Remove(backupFile)
	defer file.Close()

	// Экспортируем данные
	if err := exportTableToWriter(tableName, file); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Возвращаем файл
	c.FileAttachment(backupFile, fmt.Sprintf("%s_backup.csv", tableName))
}

// BackupRow создает резервную копию строки
func BackupRow(c *gin.Context) {
	tableName := c.Param("name")
	rowID := c.Param("id")

	// 1. Получаем имя первичного ключа для таблицы
	pkColumn, err := getPrimaryKeyColumn(initializers.DB, tableName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 2. Выполняем запрос с динамическим PK
	var data map[string]interface{}
	query := fmt.Sprintf("SELECT * FROM %s WHERE %s = ? LIMIT 1", tableName, pkColumn)
	if err := initializers.DB.Raw(query, rowID).Scan(&data).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Строка не найдена"})
		return
	}

	if len(data) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Строка не найдена"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"table": tableName,
		"id":    rowID,
		"data":  data,
	})
}

// RestoreRow восстанавливает строку из резервной копии
func RestoreRow(c *gin.Context) {
	var backup struct {
		Table string                 `json:"table"`
		ID    string                 `json:"id"`
		Data  map[string]interface{} `json:"data"`
	}

	if err := c.ShouldBindJSON(&backup); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Проверяем существование таблицы
	var exists bool
	if err := initializers.DB.Raw(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = ?
        )`, backup.Table).Scan(&exists).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Таблица не найдена"})
		return
	}

	// Восстанавливаем данные
	if err := initializers.DB.Table(backup.Table).Where("id = ?", backup.ID).Updates(backup.Data).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "Строка восстановлена"})
}

// AddColumn добавляет колонку в таблицу
func AddColumn(c *gin.Context) {
	tableName := c.Param("name")

	var req struct {
		Name string `json:"name" binding:"required"`
		Type string `json:"type" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Проверяем существование таблицы
	var exists bool
	if err := initializers.DB.Raw(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = ?
        )`, tableName).Scan(&exists).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Таблица не найдена"})
		return
	}

	// Проверяем, что колонка не существует
	var columnExists bool
	if err := initializers.DB.Raw(`
        SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = ? AND column_name = ?
        )`, tableName, req.Name).Scan(&columnExists).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if columnExists {
		c.JSON(http.StatusConflict, gin.H{"error": "Колонка уже существует"})
		return
	}

	// Добавляем колонку
	sql := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", tableName, req.Name, req.Type)
	if err := initializers.DB.Exec(sql).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "Колонка добавлена"})
}

// Получение данных таблицы
func GetTableData(c *gin.Context) {
	tableName := c.Param("name")

	// Получаем колонки
	var columns []string
	if err := initializers.DB.Raw(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = ?
        ORDER BY ordinal_position
    `, tableName).Scan(&columns).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Получаем данные
	var rows []map[string]interface{}
	if err := initializers.DB.Table(tableName).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"columns": columns,
		"rows":    rows,
	})
}

// AddRow добавляет новую строку в таблицу
func AddRow(c *gin.Context) {
	tableName := c.Param("name")
	var rowData map[string]interface{}

	if err := c.ShouldBindJSON(&rowData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := initializers.DB.Table(tableName).Create(&rowData).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "Строка добавлена",
		"data":   rowData,
	})
}

// UpdateRow обновляет существующую строку
func UpdateRow(c *gin.Context) {
	tableName := c.Param("name")
	rowID := c.Param("id")

	var rowData map[string]interface{}
	if err := c.ShouldBindJSON(&rowData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Получаем имя первичного ключа
	pkColumn, err := getPrimaryKeyColumn(initializers.DB, tableName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := initializers.DB.Table(tableName).Where(pkColumn+" = ?", rowID).Updates(rowData).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "Строка обновлена",
		"data":   rowData,
	})
}

// DeleteRow удаляет строку
func DeleteRow(c *gin.Context) {
	tableName := c.Param("name")
	rowID := c.Param("id")

	// Получаем имя первичного ключа
	pkColumn, err := getPrimaryKeyColumn(initializers.DB, tableName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := initializers.DB.Table(tableName).Where(pkColumn+" = ?", rowID).Delete(nil).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "Строка удалена"})
}

// Вспомогательная функция для получения первичного ключа
//func getPrimaryKeyColumn(db *gorm.DB, tableName string) (string, error) {
//	var pkColumn string
//	// Для PostgreSQL
//	query := `
//		SELECT a.attname
//		FROM pg_index i
//		JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
//		WHERE i.indrelid = $1::regclass AND i.indisprimary
//		LIMIT 1;
//	`
//	row := db.Raw(query, tableName).Row()
//	if err := row.Scan(&pkColumn); err != nil {
//		return "", err
//	}
//	return pkColumn, nil
//}

// Удаление колонки
func DropColumn(c *gin.Context) {
	tableName := c.Param("name")
	columnName := c.Param("column")

	sql := fmt.Sprintf("ALTER TABLE %s DROP COLUMN %s", tableName, columnName)
	if err := initializers.DB.Exec(sql).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "Колонка удалена"})
}

// Вспомогательные функции

func exportTableToWriter(table string, w io.Writer) error {
	var results []map[string]interface{}
	if err := initializers.DB.Table(table).Find(&results).Error; err != nil {
		return err
	}

	writer := csv.NewWriter(w)
	defer writer.Flush()

	if len(results) == 0 {
		return nil
	}

	// Заголовки
	headers := make([]string, 0, len(results[0]))
	for k := range results[0] {
		headers = append(headers, k)
	}
	if err := writer.Write(headers); err != nil {
		return err
	}

	// Данные
	for _, row := range results {
		values := make([]string, 0, len(headers))
		for _, h := range headers {
			val := row[h]
			strVal := ""

			switch v := val.(type) {
			case nil:
				strVal = ""
			case []byte:
				strVal = string(v)
			case time.Time:
				strVal = v.Format(time.RFC3339)
			default:
				strVal = fmt.Sprintf("%v", v)
			}

			// Экранируем кавычки для CSV
			strVal = strings.ReplaceAll(strVal, `"`, `""`)
			if strings.ContainsAny(strVal, `,"`) {
				strVal = `"` + strVal + `"`
			}

			values = append(values, strVal)
		}

		if err := writer.Write(values); err != nil {
			return err
		}
	}

	return nil
}

// RestoreTable восстанавливает таблицу из CSV файла
func RestoreTable(c *gin.Context) {
	tableName := c.Param("name")

	// 1. Проверяем существование таблицы
	var exists bool
	if err := initializers.DB.Raw(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = ?
        )`, tableName).Scan(&exists).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка проверки таблицы"})
		return
	}

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Таблица '%s' не найдена", tableName)})
		return
	}

	// 2. Получаем файл из запроса
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Файл не загружен"})
		return
	}

	// 3. Открываем файл
	f, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка открытия файла"})
		return
	}
	defer f.Close()

	// 4. Читаем CSV
	reader := csv.NewReader(f)
	headers, err := reader.Read()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ошибка чтения CSV"})
		return
	}

	// 5. Начинаем транзакцию
	tx := initializers.DB.Begin()

	// 6. Очищаем таблицу перед восстановлением
	if err := tx.Exec(fmt.Sprintf("TRUNCATE TABLE %s", tableName)).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка очистки таблицы"})
		return
	}

	// 7. Импортируем данные
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": "Ошибка чтения строки CSV"})
			return
		}

		// Формируем запрос
		values := make([]string, len(record))
		for i, v := range record {
			if v == "NULL" {
				values[i] = "NULL"
			} else {
				values[i] = fmt.Sprintf("'%s'", strings.ReplaceAll(v, "'", "''"))
			}
		}

		query := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
			tableName,
			strings.Join(headers, ", "),
			strings.Join(values, ", "))

		if err := tx.Exec(query).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{
				"error":   "Ошибка вставки данных",
				"details": err.Error(),
			})
			return
		}
	}

	// 8. Фиксируем транзакцию
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка фиксации транзакции"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": fmt.Sprintf("Таблица %s успешно восстановлена", tableName)})
}

func restoreTableFromZip(tx *gorm.DB, zipFile *zip.File, tableName string) error {
	rc, err := zipFile.Open()
	if err != nil {
		return err
	}
	defer rc.Close()

	reader := csv.NewReader(rc)
	headers, err := reader.Read()
	if err != nil {
		return err
	}

	// Удаляем старую таблицу если есть
	if err := tx.Exec(fmt.Sprintf("DROP TABLE IF EXISTS %s", tableName)).Error; err != nil {
		return err
	}

	// Создаем новую таблицу
	columns := make([]string, len(headers))
	for i, h := range headers {
		columns[i] = fmt.Sprintf("%s TEXT", h) // При восстановлении все колонки TEXT
	}

	createSQL := fmt.Sprintf("CREATE TABLE %s (%s)", tableName, strings.Join(columns, ", "))
	if err := tx.Exec(createSQL).Error; err != nil {
		return err
	}

	// Вставляем данные
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		values := make([]string, len(record))
		for i, v := range record {
			// Экранируем специальные символы
			v = strings.ReplaceAll(v, "'", "''")
			values[i] = fmt.Sprintf("'%s'", v)
		}

		insertSQL := fmt.Sprintf("INSERT INTO %s VALUES (%s)", tableName, strings.Join(values, ", "))
		if err := tx.Exec(insertSQL).Error; err != nil {
			return err
		}
	}

	return nil
}

func getPrimaryKeyColumn(db *gorm.DB, tableName string) (string, error) {
	var pkColumn string
	query := `
        SELECT a.attname AS column_name
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = $1::regclass
        AND i.indisprimary;
    `
	row := db.Raw(query, tableName).Row()
	if err := row.Scan(&pkColumn); err != nil {
		return "", fmt.Errorf("не удалось определить первичный ключ: %v", err)
	}
	return pkColumn, nil
}
