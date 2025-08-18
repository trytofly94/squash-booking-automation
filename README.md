# Squash Booking Automation

A modern, Playwright-based automation system for booking squash courts with intelligent slot selection and comprehensive testing capabilities.

## 🎯 Features

- **Intelligent Booking Logic**: Automatically finds and books optimal court slots
- **Multi-Court Search**: Searches across all available courts for the best options
- **Isolation Prevention**: Avoids creating isolated 30-minute slots that fragment the schedule
- **Retry Mechanism**: Robust error handling with configurable retry attempts
- **Dry-Run Mode**: Test the entire booking flow without making actual reservations
- **Comprehensive Testing**: Unit and integration tests with mock capabilities
- **TypeScript**: Full type safety and modern development experience

## 🚀 Quick Start

### Prerequisites

- Node.js (version 18.0.0 or higher)
- npm (version 8.0.0 or higher)

### Installation

```bash
# Clone the repository
git clone https://github.com/trytofly94/squash-booking-automation.git
cd squash-booking-automation

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install
```

### Configuration

1. Copy the environment template:
```bash
cp .env.example .env
```

2. Configure your booking parameters in `.env`:
```env
# Booking Configuration
DAYS_AHEAD=20
TARGET_START_TIME=14:00
MAX_RETRIES=3
DRY_RUN=true

# Authentication (optional)
USER_EMAIL=your.email@example.com
USER_PASSWORD=your_password
```

### Usage

```bash
# Run in dry-run mode (recommended for testing)
npm run dev

# Run with actual booking (use with caution)
DRY_RUN=false npm run dev

# Run tests
npm test

# Run Playwright tests
npm run test:playwright
```

## 🏗️ Architecture

### Core Components

- **`BookingManager`**: Main orchestrator for the booking process
- **`SlotSearcher`**: Finds available slots across multiple courts
- **`IsolationChecker`**: Prevents slot fragmentation by checking for isolated slots
- **`DateTimeCalculator`**: Handles all date and time calculations

### Page Objects

- **`BasePage`**: Common Playwright functionality and utilities
- **`BookingCalendarPage`**: Interaction with the booking calendar interface
- **`CheckoutPage`**: Handles login, checkout, and payment processes

## 🧪 Testing

The project includes comprehensive testing capabilities:

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run with coverage
npm run test:coverage

# Run Playwright end-to-end tests
npm run test:playwright
```

### Test Structure

```
tests/
├── unit/          # Unit tests for individual components
├── integration/   # Integration tests for component interaction
└── fixtures/      # Test data and mock responses
```

## 📁 Project Structure

```
squash-booking-automation/
├── src/
│   ├── core/              # Core business logic
│   │   ├── BookingManager.ts
│   │   ├── SlotSearcher.ts
│   │   ├── IsolationChecker.ts
│   │   └── DateTimeCalculator.ts
│   ├── pages/             # Page Object Model
│   │   ├── BasePage.ts
│   │   ├── BookingCalendarPage.ts
│   │   └── CheckoutPage.ts
│   ├── types/             # TypeScript type definitions
│   │   └── booking.types.ts
│   └── utils/             # Utility functions
│       └── logger.ts
├── tests/                 # Test files
├── config/               # Configuration files
├── docs/                 # Documentation
└── scripts/              # Build and deployment scripts
```

## 🔧 Configuration Options

### Booking Configuration

- **`daysAhead`**: How many days in advance to book (default: 20)
- **`targetStartTime`**: Preferred start time in HH:MM format (default: "14:00")
- **`duration`**: Booking duration in minutes (default: 60)
- **`maxRetries`**: Maximum retry attempts on failure (default: 3)
- **`dryRun`**: Run without making actual bookings (default: true)

### Environment Variables

```env
# Booking Settings
DAYS_AHEAD=20
TARGET_START_TIME=14:00
DURATION=60
MAX_RETRIES=3
DRY_RUN=true

# Logging
LOG_LEVEL=info

# Authentication (optional)
USER_EMAIL=
USER_PASSWORD=

# Advanced Settings
NAVIGATION_TIMEOUT=30000
ACTION_TIMEOUT=10000
```

## 🛡️ Safety Features

### Dry-Run Mode

The system includes a comprehensive dry-run mode that:
- Simulates the entire booking process
- Validates all logic without making actual reservations
- Provides detailed logging of what would happen
- Perfect for testing and development

### Isolation Prevention

The intelligent booking system prevents creating isolated 30-minute slots by:
- Checking slots before and after the target booking time
- Warning about potential isolation issues
- Suggesting alternative courts or times when isolation would occur

## 📊 Monitoring and Logging

The system provides comprehensive logging with different levels:

- **DEBUG**: Detailed execution information
- **INFO**: General process information
- **WARN**: Non-critical issues and warnings
- **ERROR**: Critical errors and failures

Logs are saved to:
- `logs/combined.log`: All log entries
- `logs/error.log`: Error-level entries only
- Console output (in development)

## 🚦 Development

### Code Quality

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Type checking
npm run type-check
```

### Building

```bash
# Build the project
npm run build

# Clean build artifacts
npm run clean
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Use TypeScript for all new code
- Follow the existing code style and linting rules
- Write tests for new functionality
- Update documentation as needed
- Test in dry-run mode before committing

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This automation tool is designed for personal use. Please ensure you comply with the terms of service of the booking platform and use responsibly. The authors are not responsible for any misuse or violations of service terms.

## 🆘 Support

If you encounter issues or need help:

1. Check the [documentation](docs/)
2. Review existing [issues](https://github.com/trytofly94/squash-booking-automation/issues)
3. Create a new issue with detailed information about your problem

## 📈 Roadmap

- [ ] Multi-platform support (additional booking systems)
- [ ] Web dashboard for configuration and monitoring
- [ ] Mobile notifications for booking status
- [ ] Advanced scheduling with multiple time preferences
- [ ] Integration with calendar applications