# Contributing to Par Noir

Thank you for your interest in contributing to Par Noir! This document provides guidelines and information for contributors.

## 🎯 **Project Overview**

Par Noir is a decentralized identity management system that enables users to create, manage, and control their digital identities with military-grade security and privacy.

### **Key Principles**
- **Privacy First**: User data stays on their devices
- **Decentralized**: No central control or servers
- **Open Source**: Transparent and auditable code
- **Security Focused**: Military-grade cryptography
- **User Control**: Users own and control their data

## 🚀 **Getting Started**

### **Prerequisites**
- Node.js 18+ 
- npm 8+
- Git
- Modern browser (Chrome, Firefox, Safari, Edge)

### **Development Setup**

1. **Clone the Repository**
```bash
git clone https://github.com/yourusername/par-noir.git
cd par-noir
```

2. **Install Dependencies**
```bash
npm install
cd apps/id-dashboard && npm install
cd ../../core/identity-core && npm install
cd ../../sdk/identity-sdk && npm install
```

3. **Start Development Server**
```bash
cd apps/id-dashboard
npm run dev
```

4. **Run Tests**
```bash
npm test
```

## 📁 **Project Structure**

```
par-noir/
├── apps/
│   ├── id-dashboard/          # Main web dashboard
│   ├── browser-app/           # Browser extension
│   └── developer-portal/      # Developer tools
├── core/
│   └── identity-core/         # Core TypeScript library
├── sdk/
│   ├── identity-sdk/          # Main SDK
│   ├── tools-sdk/             # Third-party tool SDK
│   └── browser-sdk/           # Browser integration SDK
├── docs/                      # Documentation
├── scripts/                   # Build and deployment scripts
└── api/                       # Decentralized auth server and APIs
```

## 🔧 **Development Guidelines**

### **Code Style**

#### **TypeScript**
- Use TypeScript for all new code
- Follow strict TypeScript configuration
- Use proper type annotations
- Avoid `any` types when possible

#### **React Components**
- Use functional components with hooks
- Follow React best practices
- Use TypeScript for props and state
- Implement proper error boundaries

#### **Security**
- Follow security best practices
- Use cryptographic libraries properly
- Validate all inputs
- Implement proper error handling

### **Testing**

#### **Unit Tests**
- Write tests for all new features
- Maintain 80%+ code coverage
- Use Jest for testing framework
- Mock external dependencies

#### **Integration Tests**
- Test component interactions
- Test API integrations
- Test user workflows
- Use Playwright for E2E tests

### **Documentation**

#### **Code Documentation**
- Document all public APIs
- Use JSDoc comments
- Include usage examples
- Keep documentation up to date

#### **User Documentation**
- Update user guides for new features
- Include screenshots and examples
- Maintain troubleshooting guides
- Keep documentation accessible

## 🎯 **Contribution Areas**

### **High Priority**
- **Security Improvements**: Cryptographic enhancements
- **Bug Fixes**: Critical security or functionality issues
- **Performance**: Optimization of core functions
- **Accessibility**: WCAG compliance improvements

### **Medium Priority**
- **New Features**: User-requested functionality
- **UI/UX Improvements**: Interface enhancements
- **Documentation**: Better guides and examples
- **Testing**: Additional test coverage

### **Low Priority**
- **Code Refactoring**: Code quality improvements
- **Tooling**: Development tool enhancements
- **Examples**: Additional usage examples
- **Translations**: Internationalization support

## 🔄 **Contribution Process**

### **1. Issue Reporting**

#### **Bug Reports**
- Use the bug report template
- Include steps to reproduce
- Provide error messages and logs
- Include system information

#### **Feature Requests**
- Use the feature request template
- Explain the use case
- Describe the expected behavior
- Consider implementation complexity

### **2. Development Workflow**

1. **Create a Branch**
```bash
git checkout -b feature/your-feature-name
```

2. **Make Changes**
- Follow coding guidelines
- Write tests for new features
- Update documentation
- Test thoroughly

3. **Commit Changes**
```bash
git add .
git commit -m "feat: add new feature description"
```

4. **Push and Create PR**
```bash
git push origin feature/your-feature-name
```

### **3. Pull Request Process**

#### **PR Requirements**
- Clear description of changes
- Link to related issues
- Include tests for new features
- Update documentation if needed
- Pass all CI checks

#### **Review Process**
- Code review by maintainers
- Security review for sensitive changes
- Performance review for major changes
- Documentation review

#### **Merge Criteria**
- All tests passing
- Code review approved
- Security review passed
- Documentation updated

## 🛡️ **Security Guidelines**

### **Cryptographic Code**
- Use established cryptographic libraries
- Follow NIST guidelines
- Implement proper key management
- Use secure random number generation

### **Input Validation**
- Validate all user inputs
- Sanitize data before processing
- Use parameterized queries
- Implement rate limiting

### **Error Handling**
- Don't expose sensitive information
- Log errors appropriately
- Handle edge cases gracefully
- Provide user-friendly error messages

### **Security Review**
- All security-related changes require review
- Use automated security scanning
- Follow secure coding practices
- Regular security audits

## 📚 **Documentation Standards**

### **Code Comments**
```typescript
/**
 * Creates a new identity with the specified parameters
 * @param username - Unique username for the identity
 * @param nickname - Display name for the identity
 * @param passcode - Secure passcode for authentication
 * @returns Promise resolving to the created identity
 * @throws {Error} If username is already taken
 */
async function createIdentity(username: string, nickname: string, passcode: string): Promise<Identity> {
  // Implementation
}
```

### **README Updates**
- Update README for new features
- Include usage examples
- Update installation instructions
- Keep feature list current

### **API Documentation**
- Document all public APIs
- Include request/response examples
- Document error codes
- Keep OpenAPI specs updated

## 🧪 **Testing Standards**

### **Unit Tests**
```typescript
describe('IdentityManager', () => {
  it('should create identity with valid parameters', async () => {
    const manager = new IdentityManager();
    const identity = await manager.createIdentity({
      username: 'testuser',
      nickname: 'Test User',
      passcode: 'securepass123'
    });
    
    expect(identity.username).toBe('testuser');
    expect(identity.nickname).toBe('Test User');
  });
});
```

### **Integration Tests**
- Test component interactions
- Test API integrations
- Test user workflows
- Test error scenarios

### **E2E Tests**
- Test complete user journeys
- Test cross-browser compatibility
- Test mobile responsiveness
- Test accessibility features

## 🚀 **Release Process**

### **Version Management**
- Follow semantic versioning (SemVer)
- Update version numbers appropriately
- Maintain changelog
- Tag releases properly

### **Release Checklist**
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Security review completed
- [ ] Performance tested
- [ ] Changelog updated
- [ ] Version numbers updated
- [ ] Release notes prepared

### **Deployment**
- Automated deployment pipeline
- Staging environment testing
- Production deployment
- Post-deployment monitoring

## 🤝 **Community Guidelines**

### **Code of Conduct**
- Be respectful and inclusive
- Welcome diverse perspectives
- Provide constructive feedback
- Help newcomers

### **Communication**
- Use clear and respectful language
- Provide context for suggestions
- Ask questions when unclear
- Share knowledge and experience

### **Collaboration**
- Work together on complex issues
- Share ideas and approaches
- Help review others' work
- Mentor new contributors

## 📞 **Getting Help**

### **Resources**
- **Documentation**: docs.parnoir.com
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Community**: community.parnoir.com

### **Contact**
- **General Questions**: support@parnoir.com
- **Security Issues**: security@parnoir.com
- **Technical Support**: dev-support@parnoir.com

## 🎉 **Recognition**

### **Contributor Recognition**
- Contributors listed in README
- Special recognition for major contributions
- Contributor badges and profiles
- Community spotlight features

### **Contributor Benefits**
- Early access to new features
- Direct communication with maintainers
- Influence on project direction
- Professional networking opportunities

---

**Thank you for contributing to Par Noir! Your contributions help make digital identity more secure, private, and user-controlled.**
