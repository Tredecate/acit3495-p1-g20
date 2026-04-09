# ACIT3495 - Project - Group 20 (& Later Group 5)
*Link to technical report: [TECHNICAL_REPORT.md](./TECHNICAL_REPORT.md)*

*Link to deployment report: [DEPLOYMENT_REPORT.md](./DEPLOYMENT_REPORT.md) **(FOR PART TWO!!!)*** 
## Group Members
- [Thomas](https://github.com/Tredecate)
- [Maksym](https://github.com/nemanull)

## Setup Instructions
1. Clone the repository
2. Copy the `.env.example` file to `.env` and update the environment variables as needed
3. Run `docker compose up -d` to start the services
4. Access `http://localhost:8080` for the Data Entry Web App and `http://localhost:8081` for the Analytics Web App
5. Use the Data Entry Web App's login page to authenticate with the admin credentials set in `.env`

## Usage
- Go to the Data Entry Web App's admin-only users management page to create additional user accounts
- Sign in to the Data Entry Web App to input data, which will be stored in MySQL/MariaDB
- The Analytics Service will process the data and store results in MongoDB
- Sign in to the Analytics Web App to view analytics results

## Teardown Instructions
- **To stop the services but retain data**: run `docker compose down` in the project root directory
- **To stop the services and remove all data**: run `docker compose down -v` in the project root directory (this will remove all named volumes, including database data)

## Service Overview
- **Data Entry Web App**: A web application for entering data
- **Analytics Web App**: A web application for viewing analytics
- **Authentication Service**: A service for handling user authentication
- **Analytics Service**: A service for processing and analyzing data
- **MySQL/MariaDB**: Relational database for storing raw data
- **MongoDB**: A NoSQL database for storing analytics results