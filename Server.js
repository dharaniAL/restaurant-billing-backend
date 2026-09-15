const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");

const app = express();
const PORT = process.env.PORT || 5000;

// ===============================
// MIDDLEWARE
// ===============================

app.use(cors());
app.use(express.json());

// ===============================
// DATABASE
// ===============================

const db = new sqlite3.Database("./restaurant.db", (err) => {
  if (err) {
    console.error("Database connection failed:", err.message);
  } else {
    console.log("SQLite database connected");
  }
});

// ===============================
// DATABASE INITIALIZATION
// ===============================

db.serialize(() => {
  // USERS TABLE
  db.run(
    `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    `,
    (err) => {
      if (err) {
        console.error("Users table creation failed:", err.message);
      } else {
        console.log("✓ Users table ready");

        bcrypt.hash("1234", 10, (hashError, hashedPassword) => {
          if (hashError) {
            console.error(
              "Password hashing failed:",
              hashError.message
            );
            return;
          }

          db.run(
            `
            INSERT OR IGNORE INTO users
            (username, password, role)
            VALUES (?, ?, ?)
            `,
            ["admin", hashedPassword, "admin"],
            (adminError) => {
              if (adminError) {
                console.error(
                  "Admin creation failed:",
                  adminError.message
                );
              } else {
                console.log("✓ Default admin user ready");
              }
            }
          );
        });
      }
    }
  );

  // BILLS TABLE
  db.run(
    `
    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_number TEXT UNIQUE NOT NULL,
      user_id INTEGER,
      customer_name TEXT DEFAULT 'Customer',
      order_type TEXT NOT NULL,
      table_number TEXT,
      subtotal REAL NOT NULL,
      tax REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL NOT NULL,
      payment_method TEXT NOT NULL,
      status TEXT DEFAULT 'Completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
    `,
    (err) => {
      if (err) {
        console.error("Bills table creation failed:", err.message);
      } else {
        console.log("✓ Bills table ready");
      }
    }
  );

  // BILL ITEMS TABLE
  db.run(
    `
    CREATE TABLE IF NOT EXISTS bill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      total REAL NOT NULL,
      FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
    )
    `,
    (err) => {
      if (err) {
        console.error(
          "Bill items table creation failed:",
          err.message
        );
      } else {
        console.log("✓ Bill items table ready");
      }
    }
  );

  // ORDERS TABLE
  db.run(
    `
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL,
      customer_name TEXT DEFAULT 'Customer',
      order_type TEXT NOT NULL,
      status TEXT DEFAULT 'Processing',
      order_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      ready_time DATETIME,
      delivered_time DATETIME,
      FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
    )
    `,
    (err) => {
      if (err) {
        console.error(
          "Orders table creation failed:",
          err.message
        );
      } else {
        console.log("✓ Orders table ready");
      }
    }
  );

  // USER ACTIVITY LOGS TABLE - THIS IS THE NEW FEATURE!
  db.run(
    `
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      bill_number TEXT,
      order_id INTEGER,
      payment_method TEXT,
      amount REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
    `,
    (err) => {
      if (err) {
        console.error(
          "Activity logs table creation failed:",
          err.message
        );
      } else {
        console.log("✓ Activity logs table ready");
      }
    }
  );

  // EXPENSES TABLE
  db.run(
    `
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_name TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT,
      expense_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_id INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
    `,
    (err) => {
      if (err) {
        console.error(
          "Expenses table creation failed:",
          err.message
        );
      } else {
        console.log("✓ Expenses table ready");
      }
    }
  );

  // TABLES STATUS TABLE
 // TABLES STATUS TABLE
db.run(
  `
  CREATE TABLE IF NOT EXISTS table_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_number TEXT UNIQUE NOT NULL,
    seats INTEGER,
    status TEXT DEFAULT 'Available',
    current_bill REAL DEFAULT 0,
    occupied_time DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
  `,
  (err) => {
    if (err) {
      console.error(
        "Table status table creation failed:",
        err.message
      );
    } else {
      console.log("✓ Table status table ready");
    

      // ==========================================
      // DEFAULT RESTAURANT TABLES
      // ==========================================

      const defaultTables = [
        ["T1", 2],
        ["T2", 2],
        ["T3", 4],
        ["T4", 4],
        ["T5", 4],
        ["T6", 4],
        ["T7", 6],
        ["T8", 6],
        ["T9", 6],
        ["T10", 8]
      ];

      const insertTable = db.prepare(`
        INSERT OR IGNORE INTO table_status
        (table_number, seats, status, current_bill)
        VALUES (?, ?, 'Available', 0)
      `);

      defaultTables.forEach((table) => {
        insertTable.run(table[0], table[1]);
      });

      insertTable.finalize((insertError) => {
        if (insertError) {
          console.error(
            "Default tables creation failed:",
            insertError.message
          );
        } else {
          console.log("✓ Default restaurant tables ready");
        }
      });
    }
  }
);
});


// ===============================
// UTILITY: LOG USER ACTIVITY
// ===============================

function logActivity(
  userId,
  actionType,
  action,
  details = null,
  billNumber = null,
  orderId = null,
  paymentMethod = null,
  amount = null
) {
  db.run(
    `
    INSERT INTO activity_logs
    (user_id, action_type, action, details, bill_number, order_id, payment_method, amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      userId,
      actionType,
      action,
      details,
      billNumber,
      orderId,
      paymentMethod,
      amount,
    ],
    function (err) {
      if (err) {
        console.error(
          "Failed to log activity:",
          err.message
        );
        return;
      }

      // ==========================================
      // DISPLAY ACTIVITY IN VS CODE TERMINAL
      // ==========================================

      console.log(`
========================================
           USER ACTIVITY
========================================
User ID      : ${userId}
Action Type  : ${actionType}
Action       : ${action}
Details      : ${details || "-"}
Bill Number  : ${billNumber || "-"}
Order ID     : ${orderId || "-"}
Payment      : ${paymentMethod || "-"}
Amount       : ${
        amount !== null && amount !== undefined
          ? `₹${Number(amount).toFixed(2)}`
          : "-"
      }
Date & Time  : ${new Date().toLocaleString("en-IN")}
========================================
`);
    }
  );
}
// ===============================
// TEST ROUTE
// ===============================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "🍽️ JK Restaurant Backend (Enhanced) is running",
  });
});

// ===============================
// LOGIN
// ===============================

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: "Username and password are required",
    });
  }

  db.get(
    `
    SELECT id, username, password, role
    FROM users
    WHERE username = ?
    `,
    [username],
    async (err, user) => {
      if (err) {
        console.error("Login database error:", err.message);
        return res.status(500).json({
          success: false,
          message: "Database error",
        });
      }

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid username or password",
        });
      }

      try {
        const passwordMatch = await bcrypt.compare(
          password,
          user.password
        );

        if (!passwordMatch) {
          return res.status(401).json({
            success: false,
            message: "Invalid username or password",
          });
        }

        // Log login activity
        logActivity(
          user.id,
          "LOGIN",
          "User logged into dashboard",
          `Username: ${username}`
        );

        res.json({
          success: true,
          message: "Login successful",
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
          },
        });
      } catch (passwordError) {
        console.error(
          "Password comparison failed:",
          passwordError.message
        );
        res.status(500).json({
          success: false,
          message: "Login failed",
        });
      }
    }
  );
});

// ===============================
// CREATE BILL / ORDER
// ===============================

app.post("/api/bills", (req, res) => {
  const {
    bill_number,
    user_id,
    customer_name,
    order_type,
    table_number,
    subtotal,
    tax,
    discount,
    total,
    payment_method,
    items,
  } = req.body;

  if (
    !bill_number ||
    !user_id ||
    !order_type ||
    !total ||
    !payment_method ||
    !items ||
    items.length === 0
  ) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields",
    });
  }

  // Insert bill
  db.run(
    `
    INSERT INTO bills
    (bill_number, user_id, customer_name, order_type, table_number, subtotal, tax, discount, total, payment_method)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      bill_number,
      user_id,
      customer_name || "Customer",
      order_type,
      table_number || null,
      subtotal,
      tax || 0,
      discount || 0,
      total,
      payment_method,
    ],
    function (err) {
      if (err) {
        console.error("Bill creation failed:", err.message);
        return res.status(500).json({
          success: false,
          message: "Failed to create bill",
        });
      }

      const billId = this.lastID;

      // Insert bill items
      let itemsInserted = 0;
      items.forEach((item) => {
        db.run(
          `
          INSERT INTO bill_items
          (bill_id, item_name, quantity, price, total)
          VALUES (?, ?, ?, ?, ?)
          `,
          [
            billId,
            item.item_name,
            item.quantity,
            item.price,
            item.total,
          ],
          (itemErr) => {
            if (itemErr) {
              console.error(
                "Item insertion failed:",
                itemErr.message
              );
            }
            itemsInserted++;
          }
        );
      });

      // Create order record
      db.run(
        `
        INSERT INTO orders
        (bill_id, customer_name, order_type)
        VALUES (?, ?, ?)
        `,
        [billId, customer_name || "Customer", order_type],
        (orderErr) => {
          if (orderErr) {
            console.error(
              "Order creation failed:",
              orderErr.message
            );
          }
        }
      );

      // Log activity - Order Created
      const itemsList = items
        .map((item) => `${item.item_name} (Qty: ${item.quantity})`)
        .join(", ");

      logActivity(
        user_id,
        "ORDER_CREATED",
        `New ${order_type} order placed`,
        `Items: ${itemsList}`,
        bill_number,
        billId,
        payment_method,
        total
      );

      res.status(201).json({
        success: true,
        message: "Bill created successfully",
        bill_id: billId,
        bill_number: bill_number,
      });
    }
  );
});

// ===============================
// GET ALL ORDERS
// ===============================

app.get("/api/orders", (req, res) => {
  const query = `
    SELECT
      orders.id AS order_id,
      bills.id AS bill_id,
      bills.bill_number,
      bills.customer_name,
      bills.order_type,
      bills.payment_method,
      bills.total,
      bills.user_id,
      orders.status,
      orders.order_time,
      orders.ready_time,
      orders.delivered_time,
      GROUP_CONCAT(bill_items.item_name || ' (x' || bill_items.quantity || ')', ', ') AS items
    FROM orders
    INNER JOIN bills ON orders.bill_id = bills.id
    LEFT JOIN bill_items ON bills.id = bill_items.bill_id
    GROUP BY orders.id
    ORDER BY orders.order_time DESC
  `;

  db.all(query, [], (err, orders) => {
    if (err) {
      console.error("Failed to fetch orders:", err.message);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch orders",
      });
    }

    res.json({
      success: true,
      orders: orders || [],
    });
  });
});

// ===============================
// GET USER'S ORDERS
// ===============================

app.get("/api/orders/user/:userId", (req, res) => {
  const { userId } = req.params;

  const query = `
    SELECT
      orders.id AS order_id,
      bills.id AS bill_id,
      bills.bill_number,
      bills.customer_name,
      bills.order_type,
      bills.payment_method,
      bills.total,
      bills.user_id,
      orders.status,
      orders.order_time,
      orders.ready_time,
      orders.delivered_time,
      GROUP_CONCAT(bill_items.item_name || ' (x' || bill_items.quantity || ')', ', ') AS items
    FROM orders
    INNER JOIN bills ON orders.bill_id = bills.id
    LEFT JOIN bill_items ON bills.id = bill_items.bill_id
    WHERE bills.user_id = ?
    GROUP BY orders.id
    ORDER BY orders.order_time DESC
  `;

  db.all(query, [userId], (err, orders) => {
    if (err) {
      console.error("Failed to fetch user orders:", err.message);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch user orders",
      });
    }

    res.json({
      success: true,
      orders: orders || [],
    });
  });
});

// ===============================
// FILTER ORDERS
// ===============================

app.post("/api/orders/filter", (req, res) => {
  const { startDate, endDate, paymentMethod, orderType, status } = req.body;

  let query = `
    SELECT
      orders.id AS order_id,
      bills.id AS bill_id,
      bills.bill_number,
      bills.customer_name,
      bills.order_type,
      bills.payment_method,
      bills.total,
      bills.user_id,
      orders.status,
      orders.order_time,
      GROUP_CONCAT(bill_items.item_name || ' (x' || bill_items.quantity || ')', ', ') AS items
    FROM orders
    INNER JOIN bills ON orders.bill_id = bills.id
    LEFT JOIN bill_items ON bills.id = bill_items.bill_id
    WHERE 1=1
  `;

  const params = [];

  if (startDate && endDate) {
    query += ` AND DATE(bills.created_at) BETWEEN ? AND ?`;
    params.push(startDate, endDate);
  }

  if (paymentMethod) {
    query += ` AND bills.payment_method = ?`;
    params.push(paymentMethod);
  }

  if (orderType) {
    query += ` AND bills.order_type = ?`;
    params.push(orderType);
  }

  if (status) {
    query += ` AND orders.status = ?`;
    params.push(status);
  }

  query += ` GROUP BY orders.id ORDER BY orders.order_time DESC`;

  db.all(query, params, (err, orders) => {
    if (err) {
      console.error("Failed to filter orders:", err.message);
      return res.status(500).json({
        success: false,
        message: "Failed to filter orders",
      });
    }

    res.json({
      success: true,
      orders: orders || [],
    });
  });
});

// ===============================
// UPDATE ORDER STATUS
// ===============================

app.put("/api/orders/:orderId/status", (req, res) => {
  const { orderId } = req.params;
  const { status, user_id } = req.body;

  if (!status) {
    return res.status(400).json({
      success: false,
      message: "Status is required",
    });
  }

  db.run(
    `
    UPDATE orders
    SET status = ?
    WHERE id = ?
    `,
    [status, orderId],
    function (err) {
      if (err) {
        console.error("Failed to update order status:", err.message);
        return res.status(500).json({
          success: false,
          message: "Failed to update order status",
        });
      }

      // Get order details for logging
      db.get(
        `SELECT bill_id FROM orders WHERE id = ?`,
        [orderId],
        (err, order) => {
          if (order) {
            db.get(
              `SELECT bill_number FROM bills WHERE id = ?`,
              [order.bill_id],
              (err, bill) => {
                if (bill && user_id) {
                  logActivity(
                    user_id,
                    "ORDER_STATUS_UPDATED",
                    `Order status updated to ${status}`,
                    `Order ID: ${orderId}`,
                    bill.bill_number,
                    orderId
                  );
                }
              }
            );
          }
        }
      );

      res.json({
        success: true,
        message: "Order status updated successfully",
      });
    }
  );
});

// ===============================
// GET USER ACTIVITY LOGS - NEW FEATURE!
// ===============================

app.get("/api/user-activity", (req, res) => {
  const query = `
    SELECT
      activity_logs.id,
      activity_logs.user_id,
      users.username,
      activity_logs.action_type,
      activity_logs.action,
      activity_logs.details,
      activity_logs.bill_number,
      activity_logs.order_id,
      activity_logs.payment_method,
      activity_logs.amount,
      activity_logs.created_at
    FROM activity_logs
    LEFT JOIN users ON activity_logs.user_id = users.id
    ORDER BY activity_logs.created_at DESC
    LIMIT 100
  `;

  db.all(query, [], (err, logs) => {
    if (err) {
      console.error(
        "Failed to get activity logs:",
        err.message
      );
      return res.status(500).json({
        success: false,
        message: "Failed to get activity logs",
      });
    }

    res.json({
      success: true,
      logs: logs || [],
    });
  });
});

// ===============================
// GET ACTIVITY BY USER
// ===============================

app.get("/api/user-activity/:userId", (req, res) => {
  const { userId } = req.params;

  const query = `
    SELECT
      activity_logs.id,
      activity_logs.user_id,
      users.username,
      activity_logs.action_type,
      activity_logs.action,
      activity_logs.details,
      activity_logs.bill_number,
      activity_logs.order_id,
      activity_logs.payment_method,
      activity_logs.amount,
      activity_logs.created_at
    FROM activity_logs
    LEFT JOIN users ON activity_logs.user_id = users.id
    WHERE activity_logs.user_id = ?
    ORDER BY activity_logs.created_at DESC
    LIMIT 50
  `;

  db.all(query, [userId], (err, logs) => {
    if (err) {
      console.error(
        "Failed to get user activity logs:",
        err.message
      );
      return res.status(500).json({
        success: false,
        message: "Failed to get user activity logs",
      });
    }

    res.json({
      success: true,
      logs: logs || [],
    });
  });
});

// ===============================
// GET DELIVERY ORDERS
// ===============================

app.get("/api/deliveries", (req, res) => {
  const query = `
    SELECT
      orders.id AS order_id,
      bills.id AS bill_id,
      bills.bill_number,
      bills.customer_name,
      bills.total,
      orders.status,
      orders.order_time,
      orders.ready_time,
      orders.delivered_time,
      GROUP_CONCAT(bill_items.item_name, ', ') AS items
    FROM orders
    INNER JOIN bills ON orders.bill_id = bills.id
    LEFT JOIN bill_items ON bills.id = bill_items.bill_id
    WHERE bills.order_type = 'Delivery'
    GROUP BY orders.id
    ORDER BY orders.order_time DESC
  `;

  db.all(query, [], (err, deliveries) => {
    if (err) {
      console.error(
        "Failed to fetch deliveries:",
        err.message
      );
      return res.status(500).json({
        success: false,
        message: "Failed to fetch deliveries",
      });
    }

    res.json({
      success: true,
      deliveries: deliveries || [],
    });
  });
});


// ===============================
// GET TABLES
// ===============================

app.get("/api/tables", (req, res) => {

  // Create default tables if they do not already exist
  const defaultTables = [
    ["T1", 2],
    ["T2", 2],
    ["T3", 4],
    ["T4", 4],
    ["T5", 4],
    ["T6", 4],
    ["T7", 6],
    ["T8", 6],
    ["T9", 6],
    ["T10", 8],
  ];

  const insertQuery = `
    INSERT OR IGNORE INTO table_status
    (table_number, seats, status, current_bill)
    VALUES (?, ?, 'Available', 0)
  `;

  let completed = 0;

  defaultTables.forEach(([tableNumber, seats]) => {
    db.run(
      insertQuery,
      [tableNumber, seats],
      (err) => {

        if (err) {
          console.error(
            "Failed to create table:",
            err.message
          );
        }

        completed++;

        // After all default tables are inserted, fetch them
        if (completed === defaultTables.length) {

          const query = `
            SELECT
              table_status.id,
              table_status.table_number,
              table_status.seats,
              table_status.status,
              table_status.current_bill,
              GROUP_CONCAT(
                DISTINCT bill_items.item_name ||
                ' (x' || bill_items.quantity || ')'
              ) AS items
            FROM table_status

            LEFT JOIN bills
              ON bills.table_number = table_status.table_number
              AND bills.status != 'Completed'

            LEFT JOIN bill_items
              ON bills.id = bill_items.bill_id

            GROUP BY table_status.id
            ORDER BY table_status.id
          `;

          db.all(query, [], (err, tables) => {

            if (err) {
              console.error(
                "Failed to fetch tables:",
                err.message
              );

              return res.status(500).json({
                success: false,
                message: "Failed to fetch tables",
              });
            }

            res.json({
              success: true,
              tables: tables || [],
            });
          });
        }
      }
    );
  });
});
// ===============================
// RESERVE / OPEN TABLE
// ===============================

app.put("/api/tables/:tableId/reserve", (req, res) => {
  const { tableId } = req.params;

  db.run(
    `
    UPDATE table_status
    SET
      status = 'Occupied',
      occupied_time = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND status = 'Available'
    `,
    [tableId],
    function (err) {
      if (err) {
        console.error(
          "Failed to reserve table:",
          err.message
        );

        return res.status(500).json({
          success: false,
          message: "Failed to reserve table",
        });
      }

      if (this.changes === 0) {
        return res.status(400).json({
          success: false,
          message: "Table is already occupied or unavailable",
        });
      }

      res.json({
        success: true,
        message: "Table reserved successfully",
      });
    }
  );
});
// ===============================
// SETTLE TABLE BILL
// ===============================

app.put("/api/tables/:tableId/settle", (req, res) => {
  const { tableId } = req.params;

  db.run(
    `
    UPDATE table_status
    SET status = 'Available', current_bill = 0
    WHERE id = ?
    `,
    [tableId],
    function (err) {
      if (err) {
        console.error("Failed to settle bill:", err.message);
        return res.status(500).json({
          success: false,
          message: "Failed to settle bill",
        });
      }

      res.json({
        success: true,
        message: "Bill settled successfully",
      });
    }
  );
});

// ===============================
// GET REPORTS/DASHBOARD DATA
// ===============================

app.get("/api/reports", (req, res) => {
  const period = req.query.period || "all";

  let currentDateCondition = "1=1";
  let previousDateCondition = "1=1";
  let currentExpenseCondition = "1=1";
  let previousExpenseCondition = "1=1";

  if (period === "today") {
    currentDateCondition = "DATE(bills.created_at) = DATE('now')";
    previousDateCondition = "DATE(bills.created_at) = DATE('now', '-1 day')";
    currentExpenseCondition = "DATE(expense_date) = DATE('now')";
    previousExpenseCondition =
      "DATE(expense_date) = DATE('now', '-1 day')";
  }

  const salesQuery = `
    SELECT
      COUNT(*) AS total_bills,
      COALESCE(SUM(subtotal), 0) AS total_subtotal,
      COALESCE(SUM(tax), 0) AS total_tax,
      COALESCE(SUM(discount), 0) AS total_discount,
      COALESCE(SUM(total), 0) AS total_sales
    FROM bills
  `;

  const todayQuery = `
    SELECT
      COUNT(*) AS today_bills,
      COALESCE(SUM(total), 0) AS today_sales
    FROM bills
    WHERE ${currentDateCondition}
  `;

  const paymentQuery = `
    SELECT
      payment_method,
      COUNT(*) AS bill_count,
      COALESCE(SUM(total), 0) AS total
    FROM bills
    WHERE ${currentDateCondition}
    GROUP BY payment_method
  `;

  db.get(salesQuery, [], (salesError, sales) => {
    if (salesError) {
      return res.status(500).json({
        success: false,
        message: "Failed to get sales data",
      });
    }

    db.get(todayQuery, [], (todayError, today) => {
      if (todayError) {
        return res.status(500).json({
          success: false,
          message: "Failed to get today data",
        });
      }

      db.all(paymentQuery, [], (paymentError, payments) => {
        if (paymentError) {
          return res.status(500).json({
            success: false,
            message: "Failed to get payment data",
          });
        }

        res.json({
          success: true,
          sales: sales || {},
          today: today || {},
          payments: payments || [],
          period,
        });
      });
    });
  });
});
// ===============================
// DASHBOARD DATA
// ===============================

app.get("/api/dashboard", (req, res) => {
  const period = req.query.period || "today";

  // India local date/time
  const todayCondition = `
    DATE(bills.created_at, '+5 hours', '+30 minutes')
    =
    DATE('now', '+5 hours', '+30 minutes')
  `;

  const todayExpenseCondition = `
    DATE(expenses.expense_date, '+5 hours', '+30 minutes')
    =
    DATE('now', '+5 hours', '+30 minutes')
  `;

  // --------------------------------
  // TODAY'S SALES & BILLS
  // --------------------------------

  const todayQuery = `
    SELECT
      COUNT(*) AS today_bills,
      COALESCE(SUM(total), 0) AS today_sales
    FROM bills
    WHERE ${todayCondition}
  `;

  // --------------------------------
  // TODAY'S EXPENSES
  // --------------------------------

  const expenseQuery = `
    SELECT
      COALESCE(SUM(amount), 0) AS today_expenses
    FROM expenses
    WHERE ${todayExpenseCondition}
  `;

  // --------------------------------
  // TODAY'S PAYMENT SUMMARY
  // --------------------------------

  const paymentQuery = `
    SELECT
      payment_method,
      COUNT(*) AS bill_count,
      COALESCE(SUM(total), 0) AS total
    FROM bills
    WHERE ${todayCondition}
    GROUP BY payment_method
  `;

  // --------------------------------
  // TODAY'S DELIVERY ORDERS
  // --------------------------------

  const deliveryQuery = `
    SELECT
      COUNT(*) AS total_orders,

      SUM(
        CASE
          WHEN orders.status = 'Preparing'
          THEN 1 ELSE 0
        END
      ) AS preparing_delivery,

      SUM(
        CASE
          WHEN orders.status = 'Processing'
          THEN 1 ELSE 0
        END
      ) AS processing_delivery,

      SUM(
        CASE
          WHEN orders.status = 'Ready'
          THEN 1 ELSE 0
        END
      ) AS ready_delivery,

      SUM(
        CASE
          WHEN orders.status = 'Delivered'
          THEN 1 ELSE 0
        END
      ) AS delivered_delivery

    FROM orders
    INNER JOIN bills
      ON orders.bill_id = bills.id

    WHERE
      bills.order_type = 'Delivery'
      AND
      DATE(
        orders.order_time,
        '+5 hours',
        '+30 minutes'
      )
      =
      DATE(
        'now',
        '+5 hours',
        '+30 minutes'
      )
  `;

  // --------------------------------
  // PERIOD CONDITIONS FOR PROFIT
  // --------------------------------

  let currentBillCondition;
  let previousBillCondition;
  let currentExpenseCondition;
  let previousExpenseCondition;

  if (period === "month") {

    currentBillCondition = `
      strftime(
        '%Y-%m',
        datetime(
          bills.created_at,
          '+5 hours',
          '+30 minutes'
        )
      )
      =
      strftime(
        '%Y-%m',
        datetime(
          'now',
          '+5 hours',
          '+30 minutes'
        )
      )
    `;

    previousBillCondition = `
      strftime(
        '%Y-%m',
        datetime(
          bills.created_at,
          '+5 hours',
          '+30 minutes'
        )
      )
      =
      strftime(
        '%Y-%m',
        datetime(
          'now',
          '+5 hours',
          '+30 minutes',
          '-1 month'
        )
      )
    `;

    currentExpenseCondition = `
      strftime(
        '%Y-%m',
        datetime(
          expenses.expense_date,
          '+5 hours',
          '+30 minutes'
        )
      )
      =
      strftime(
        '%Y-%m',
        datetime(
          'now',
          '+5 hours',
          '+30 minutes'
        )
      )
    `;

    previousExpenseCondition = `
      strftime(
        '%Y-%m',
        datetime(
          expenses.expense_date,
          '+5 hours',
          '+30 minutes'
        )
      )
      =
      strftime(
        '%Y-%m',
        datetime(
          'now',
          '+5 hours',
          '+30 minutes',
          '-1 month'
        )
      )
    `;

  } else if (period === "year") {

    currentBillCondition = `
      strftime(
        '%Y',
        datetime(
          bills.created_at,
          '+5 hours',
          '+30 minutes'
        )
      )
      =
      strftime(
        '%Y',
        datetime(
          'now',
          '+5 hours',
          '+30 minutes'
        )
      )
    `;

    previousBillCondition = `
      strftime(
        '%Y',
        datetime(
          bills.created_at,
          '+5 hours',
          '+30 minutes'
        )
      )
      =
      strftime(
        '%Y',
        datetime(
          'now',
          '+5 hours',
          '+30 minutes',
          '-1 year'
        )
      )
    `;

    currentExpenseCondition = `
      strftime(
        '%Y',
        datetime(
          expenses.expense_date,
          '+5 hours',
          '+30 minutes'
        )
      )
      =
      strftime(
        '%Y',
        datetime(
          'now',
          '+5 hours',
          '+30 minutes'
        )
      )
    `;

    previousExpenseCondition = `
      strftime(
        '%Y',
        datetime(
          expenses.expense_date,
          '+5 hours',
          '+30 minutes'
        )
      )
      =
      strftime(
        '%Y',
        datetime(
          'now',
          '+5 hours',
          '+30 minutes',
          '-1 year'
        )
      )
    `;

  } else {

    currentBillCondition = todayCondition;

    previousBillCondition = `
      DATE(
        bills.created_at,
        '+5 hours',
        '+30 minutes'
      )
      =
      DATE(
        'now',
        '+5 hours',
        '+30 minutes',
        '-1 day'
      )
    `;

    currentExpenseCondition = todayExpenseCondition;

    previousExpenseCondition = `
      DATE(
        expenses.expense_date,
        '+5 hours',
        '+30 minutes'
      )
      =
      DATE(
        'now',
        '+5 hours',
        '+30 minutes',
        '-1 day'
      )
    `;
  }

  // --------------------------------
  // CURRENT PROFIT
  // --------------------------------

  const currentProfitQuery = `
    SELECT
      (
        COALESCE(
          (
            SELECT SUM(total)
            FROM bills
            WHERE ${currentBillCondition}
          ),
          0
        )
        -
        COALESCE(
          (
            SELECT SUM(amount)
            FROM expenses
            WHERE ${currentExpenseCondition}
          ),
          0
        )
      ) AS current_profit
  `;

  // --------------------------------
  // PREVIOUS PROFIT
  // --------------------------------

  const previousProfitQuery = `
    SELECT
      (
        COALESCE(
          (
            SELECT SUM(total)
            FROM bills
            WHERE ${previousBillCondition}
          ),
          0
        )
        -
        COALESCE(
          (
            SELECT SUM(amount)
            FROM expenses
            WHERE ${previousExpenseCondition}
          ),
          0
        )
      ) AS previous_profit
  `;

  // --------------------------------
  // RECENT ORDERS / BILLS
  // --------------------------------

  const recentOrdersQuery = `
    SELECT
      orders.id AS order_id,
      bills.bill_number,
      bills.payment_method,
      bills.total,
      orders.order_time
    FROM orders
    INNER JOIN bills
      ON orders.bill_id = bills.id
    ORDER BY orders.order_time DESC
    LIMIT 5
  `;

  // --------------------------------
  // RUN QUERIES
  // --------------------------------

  db.get(todayQuery, [], (todayError, today) => {

    if (todayError) {
      console.error(
        "Dashboard today query failed:",
        todayError.message
      );

      return res.status(500).json({
        success: false,
        message: "Failed to get today's dashboard data"
      });
    }

    db.get(
      expenseQuery,
      [],
      (expenseError, expenses) => {

        if (expenseError) {
          console.error(
            "Dashboard expense query failed:",
            expenseError.message
          );

          return res.status(500).json({
            success: false,
            message: "Failed to get expense data"
          });
        }

        db.all(
          paymentQuery,
          [],
          (paymentError, payments) => {

            if (paymentError) {
              console.error(
                "Dashboard payment query failed:",
                paymentError.message
              );

              return res.status(500).json({
                success: false,
                message: "Failed to get payment data"
              });
            }

            db.get(
              deliveryQuery,
              [],
              (deliveryError, delivery) => {

                if (deliveryError) {
                  console.error(
                    "Dashboard delivery query failed:",
                    deliveryError.message
                  );

                  return res.status(500).json({
                    success: false,
                    message: "Failed to get delivery data"
                  });
                }

                db.get(
                  currentProfitQuery,
                  [],
                  (currentProfitError, currentProfit) => {

                    if (currentProfitError) {
                      console.error(
                        "Current profit query failed:",
                        currentProfitError.message
                      );

                      return res.status(500).json({
                        success: false,
                        message: "Failed to get current profit"
                      });
                    }

                    db.get(
                      previousProfitQuery,
                      [],
                      (
                        previousProfitError,
                        previousProfit
                      ) => {

                        if (previousProfitError) {
                          console.error(
                            "Previous profit query failed:",
                            previousProfitError.message
                          );

                          return res.status(500).json({
                            success: false,
                            message:
                              "Failed to get previous profit"
                          });
                        }

                        db.all(
                          recentOrdersQuery,
                          [],
                          (
                            recentError,
                            recentOrders
                          ) => {

                            if (recentError) {
                              console.error(
                                "Recent orders query failed:",
                                recentError.message
                              );

                              return res.status(500).json({
                                success: false,
                                message:
                                  "Failed to get recent orders"
                              });
                            }

                            // --------------------------------
                            // FINAL DASHBOARD RESPONSE
                            // --------------------------------

                            res.json({
                              success: true,

                              today: {
                                today_bills:
                                  Number(
                                    today?.today_bills || 0
                                  ),

                                today_sales:
                                  Number(
                                    today?.today_sales || 0
                                  )
                              },

                              expenses: {
                                today_expenses:
                                  Number(
                                    expenses?.today_expenses ||
                                    0
                                  )
                              },

                              orders: {
                                total_orders:
                                  Number(
                                    delivery?.total_orders ||
                                    0
                                  ),

                                preparing_delivery:
                                  Number(
                                    delivery?.preparing_delivery ||
                                    0
                                  ),

                                processing_delivery:
                                  Number(
                                    delivery?.processing_delivery ||
                                    0
                                  ),

                                ready_delivery:
                                  Number(
                                    delivery?.ready_delivery ||
                                    0
                                  ),

                                delivered_delivery:
                                  Number(
                                    delivery?.delivered_delivery ||
                                    0
                                  )
                              },

                              payments:
                                payments || [],

                              currentProfit: {
                                current_profit:
                                  Number(
                                    currentProfit?.current_profit ||
                                    0
                                  )
                              },

                              previousProfit: {
                                previous_profit:
                                  Number(
                                    previousProfit?.previous_profit ||
                                    0
                                  )
                              },

                              recentOrders:
                                recentOrders || [],

                              period
                            });
                          }
                        );
                      }
                    );
                  }
                );
              }
            );
          }
        );
      }
    );
  });
});
// ===============================
// EXPENSES ENDPOINTS
// ===============================

app.post("/api/expenses", (req, res) => {
  const {
    expense_name,
    amount,
    category,
    date,
    user_id,
  } = req.body;

  if (!expense_name || !amount || !user_id || !date) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields",
    });
  }

  db.run(
    `
    INSERT INTO expenses
    (expense_name, amount, category, expense_date, user_id)
    VALUES (?, ?, ?, ?, ?)
    `,
    [
      expense_name,
      amount,
      category || "General",
      date,
      user_id,
    ],
    function (err) {
      if (err) {
        console.error(
          "Expense creation failed:",
          err.message
        );

        return res.status(500).json({
          success: false,
          message: "Failed to create expense",
        });
      }

      logActivity(
        user_id,
        "EXPENSE_ADDED",
        `Expense added: ${expense_name}`,
        `Category: ${
          category || "General"
        }, Amount: ₹${amount}, Date: ${date}`,
        null,
        null,
        null,
        amount
      );

      res.status(201).json({
        success: true,
        message: "Expense created successfully",
        expense_id: this.lastID,
      });
    }
  );
});
app.get("/api/expenses", (req, res) => {
 const query = `
  SELECT
    expenses.id AS expense_id,
    expenses.expense_name AS description,
    expenses.amount,
    expenses.category,
    expenses.expense_date AS date,
    expenses.user_id,
    users.username
  FROM expenses
  LEFT JOIN users
    ON expenses.user_id = users.id
  ORDER BY expenses.expense_date DESC
`;

  db.all(query, [], (err, expenses) => {
    if (err) {
      console.error("Failed to fetch expenses:", err.message);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch expenses",
      });
    }

    res.json({
      success: true,
      expenses: expenses || [],
    });
  });
});

// ===============================
// HEALTH CHECK
// ===============================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Backend is healthy",
    timestamp: new Date().toISOString(),
  });
});

// ===============================
// START SERVER
// ===============================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔════════════════════════════════════════╗
║  🍽️  JK RESTAURANT BACKEND (Enhanced)  ║
║  Port: ${PORT}                              ║
║  Status: ✓ Running                     ║
╚════════════════════════════════════════╝
  `);
  console.log(`Phone access: http://192.168.29.147:${PORT}`);
});