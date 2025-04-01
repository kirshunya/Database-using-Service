package main

import (
	"fmt"
	"server/init"
)

func init() {
	init.LoadEnv("D:\\Mapped\\.env")
	init.ConnectEnv()
	err := init.DB.AutoMigrate()
	if err != nil {
		panic(err)
	}
}

func main() {
	fmt.Println("Hello World")

}
