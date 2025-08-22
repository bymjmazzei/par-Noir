# Development Guide

## 🚀 **Getting Started**

The Identity Protocol follows a **lightweight, modular development approach** where each component can run independently.

### **Quick Start**

```bash
# Clone the repository
git clone <repository-url>
cd identity-protocol

# Install dependencies
npm install

# Start the main dashboard (recommended for most development)
npm run dev
```

The dashboard will be available at `http://localhost:3000`

## 🏗️ **Modular Development Philosophy**

### **Why Modular?**

1. **Fast Development**: Each service starts in < 200ms
2. **Independent Testing**: Test components in isolation
3. **Clear Separation**: Each component has a single responsibility
4. **Resource Efficient**: Only run what you need
5. **Standards-Based**: Leverages existing infrastructure

### **Component Independence**

Each component should:
- Run without requiring other services
- Use standardized metadata for communication
- Leverage browser-native APIs
- Follow established web standards

## 🔧 **Development Commands**

### **Individual Services**

```bash
# Main dashboard (most common)
npm run dev:dashboard

# Identity core (TypeScript library)
npm run dev:identity

# Browser app
npm run dev:browser

# Developer portal
npm run dev:portal

# Individual tools
npm run dev:security-tool
npm run dev:storage-tool
npm run dev:monetization-tool
npm run dev:browser-tool
```

### **All Services (When Needed)**

```bash
# Run all services concurrently
npm run dev:all
```

**Note**: Only use `dev:all` when you need to test integration between services. For most development, use individual service commands.

## 📊 **Port Configuration**

| Service | Port | Description |
|---------|------|-------------|
| `id-dashboard` | 3000 | Main web UI |
| `developer-portal` | 3001 | Developer tools |
| `browser-app` | 3002 | Browser extension |
| `security-tool` | 3003 | Recovery & backup |
| `storage-tool` | 3004 | Encrypted storage |
| `monetization-tool` | 3005 | Payment integration |
| `browser-tool` | 3006 | Content discovery |

## 🎯 **Development Workflows**

### **Dashboard Development**

```bash
# Start just the dashboard
npm run dev:dashboard

# Access at http://localhost:3000
# Fast startup, minimal resource usage
```

### **Tool Development**

```bash
# Start a specific tool
npm run dev:security-tool

# Tool runs independently
# Can be tested in isolation
```

### **Integration Testing**

```bash
# When you need to test service communication
npm run dev:all

# All services run concurrently
# Test cross-service functionality
```

## 📈 **Performance Expectations**

### **Startup Times**
- Dashboard: < 200ms (Vite)
- Tools: < 100ms each
- Core library: < 50ms (TypeScript compilation)

### **Resource Usage**
- Memory: < 50MB per service
- CPU: Minimal background usage
- Network: Only when needed

## 🔄 **Service Communication**

### **When Services Need to Talk**

Services communicate through:
- **Standardized APIs** (REST, GraphQL)
- **Event-driven architecture** (WebSockets, Server-Sent Events)
- **Shared metadata standards** (DID, W3C)
- **Browser-native APIs** (PostMessage, BroadcastChannel)

### **Independent Operation**

Most of the time, services don't need to communicate:
- Dashboard can run without tools
- Tools can run without browser layer
- Browser layer can run without specific tools

## 🛠️ **Development Best Practices**

### **1. Start Small**
```bash
# Begin with just the dashboard
npm run dev:dashboard
```

### **2. Add Services as Needed**
```bash
# Add a tool when you need it
npm run dev:security-tool
```

### **3. Test Independently**
```bash
# Test each component in isolation
npm run test:dashboard
npm run test:security-tool
```

### **4. Use Standards**
- Follow DID standards
- Use W3C specifications
- Leverage browser APIs
- Implement portable metadata

### **5. Keep It Light**
- Minimal dependencies
- Fast startup times
- Efficient resource usage
- Clear separation of concerns

## 🐛 **Debugging**

### **Individual Service Debugging**

```bash
# Debug just the dashboard
npm run dev:dashboard
# Check browser console for errors
```

### **Cross-Service Debugging**

```bash
# When you need to debug service communication
npm run dev:all
# Check network tab for API calls
# Monitor service logs
```

## 📚 **Documentation**

- [Architecture Overview](../architecture/overview.md)
- [API Documentation](../api/)
- [SDK Documentation](../sdk/)
- [Standards Compliance](../guides/standards.md)

## 🎯 **Success Metrics**

- [ ] Each service starts in < 200ms
- [ ] Services can run independently
- [ ] Data is portable across systems
- [ ] Standards compliance maintained
- [ ] Lightweight resource usage
- [ ] Easy developer onboarding

---

**Last Updated**: 2024
**Version**: 1.0.0 